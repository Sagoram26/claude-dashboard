import { randomUUID } from 'node:crypto';
import { query as realQuery } from '@anthropic-ai/claude-agent-sdk';
import type {
  SDKMessage,
  SDKPartialAssistantMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { createMessageQueue } from './queue.ts';
import { createPermissionBridge, type PermissionDecision } from './permissions.ts';
import type { PermissionStore } from './permission-store.ts';
import type { ServerEvent, SessionState, PermissionRequest, GrantedPermission, ContextUsage } from '../protocol.ts';

export type QueryFn = typeof realQuery;

export type SessionManagerOptions = {
  cwd: string;
  emit: (event: ServerEvent) => void;
  queryFn?: QueryFn;
  store?: PermissionStore;
};

export type SessionManager = {
  send(text: string): void;
  interrupt(): Promise<void>;
  state(): SessionState;
  stop(): Promise<void>;
  respondPermission(requestId: string, decision: PermissionDecision, reason?: string): void;
  pendingPermissions(): PermissionRequest[];
  grantedPermissions(): GrantedPermission[];
  revokePermission(toolName: string): Promise<void>;
  /**
   * L'objet `Query` du SDK. Exposé en bloc plutôt qu'en huit méthodes de délégation : la tranche 2
   * en appelle quatre, la tranche 3 en appellera cinq de plus.
   */
  control(): ReturnType<QueryFn>;
  applyRuntime(reglages: { model?: string; effort?: string; permissionMode?: string }): Promise<void>;
  /**
   * Aucune méthode `Query` dédiée à la compaction (revue exhaustive de `sdk.d.ts` en feature 05) :
   * `/compact` est un slash command, le seul chemin exposé est de l'envoyer comme texte utilisateur.
   * Ne passe pas par `send()` : pas de bulle « utilisateur » pour une action d'interface.
   */
  compact(): void;
  /** `detail: 'full'`, réservé à l'ouverture du popover de contexte. */
  requestContextDetail(): void;
  /**
   * Événements rejouables pour un client qui se (re)connecte : messages, activité d'outil et
   * demandes de permission (avec leur résolution), dans l'ordre où ils se sont produits. Sans ce
   * rejeu, reprendre une session (feature 06) restitue l'état d'exécution courant mais un fil de
   * conversation vide — le critère de fin l'exige plein.
   * N'inclut jamais `message.delta` (fragments transitoires) ni `session.state` (déjà renvoyé à part).
   */
  history(): ServerEvent[];
};

export function createSessionManager(opts: SessionManagerOptions): SessionManager {
  const queryFn = opts.queryFn ?? realQuery;
  const queue = createMessageQueue<SDKUserMessage>();

  let state: SessionState = {
    sessionId: null,
    cwd: opts.cwd,
    status: 'idle',
    model: null,
    // Doit rester d'accord avec `permissionMode` passé à `queryFn` plus bas. L'état ne doit
    // jamais annoncer un mode que la session n'applique pas.
    permissionMode: 'default',
    effort: null,
    availableModels: [],
    availableCommands: [],
    availableAgents: [],
    mcpServers: [],
  };

  // Identifiant du message assistant en cours de streaming. C'est l'id de message de l'API
  // (message_start), le même que celui porté par le SDKAssistantMessage final : les deltas et le
  // complete doivent coïncider, sinon le client affiche le texte deux fois.
  let streamingMessageId: string | null = null;

  const history: ServerEvent[] = [];
  const HISTORY_TYPES = new Set<ServerEvent['type']>([
    'message.complete',
    'tool.activity',
    'permission.request',
    'permission.resolved',
  ]);
  // Tout passe par ici plutôt que par `opts.emit` directement : c'est le seul point qui décide ce
  // qui est rejouable (feature 06), sans risquer qu'un futur appel direct à `opts.emit` l'oublie.
  const record = (event: ServerEvent): void => {
    if (HISTORY_TYPES.has(event.type)) history.push(event);
    opts.emit(event);
  };

  const setState = (patch: Partial<SessionState>) => {
    state = { ...state, ...patch };
    record({ type: 'session.state', state });
  };

  const emitError = (err: unknown) => {
    record({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  };

  const permissions = createPermissionBridge({
    emit: record,
    onPendingChange: (count) => {
      if (count > 0) setState({ status: 'awaiting-permission' });
      else if (state.status === 'awaiting-permission') setState({ status: 'generating' });
    },
    isGranted: (toolName) => opts.store?.isGranted(toolName) ?? false,
    onGrant: (toolName) => {
      // `respond()` est synchrone, l'écriture disque ne l'est pas. Sans ce `.catch`, un dossier
      // non inscriptible ou un disque plein produit un rejet non rattrapé, et Node fait tomber le
      // processus entier : un clic sur « Toujours » suffirait à tuer le serveur.
      // La permission n'est alors pas persistée — c'est le bon sens de l'échec : on redemandera.
      void opts.store
        ?.grant(toolName)
        .then(() => {
          record({ type: 'permission.granted', granted: opts.store?.list() ?? [] });
        })
        .catch(emitError);
    },
  });

  const session = queryFn({
    prompt: queue.stream,
    options: {
      cwd: opts.cwd,
      includePartialMessages: true,
      canUseTool: permissions.canUseTool,
      // Mode déclaré explicitement, jamais hérité. La tranche 2 existe pour rendre le mode manuel
      // utilisable depuis le navigateur : s'en remettre à une valeur par défaut du SDK qu'on n'a
      // pas constatée, c'est exactement la classe d'hypothèse que la reconnaissance sert à tuer.
      // La feature 06 le rendra changeable à chaud ; ici il est le point de départ.
      permissionMode: 'default',
    },
  });

  const pump = (async () => {
    for await (const message of session as AsyncIterable<SDKMessage>) {
      handleMessage(message);
    }
  })().catch((err: unknown) => {
    emitError(err);
    setState({ status: 'disconnected' });
  });

  function handleMessage(message: SDKMessage): void {
    if (message.type === 'system' && message.subtype === 'init') {
      setState({ sessionId: message.session_id, model: message.model ?? null });
      // `try` + `.catch` : la liste des modèles est un agrément, jamais une raison de faire tomber
      // l'initialisation de session — ni de faire tomber la boucle `pump` si `supportedModels` est
      // absent (un double de test qui ne teste pas les contrôles n'a pas à le fournir).
      try {
        void session
          .supportedModels()
          .then((models) =>
            setState({ availableModels: models.map((m) => ({ value: m.value, displayName: m.displayName })) })
          )
          .catch(emitError);
      } catch (err) {
        emitError(err);
      }
      try {
        void session
          .supportedCommands()
          .then((commands) =>
            setState({ availableCommands: commands.map((c) => ({ name: c.name, description: c.description })) })
          )
          .catch(emitError);
      } catch (err) {
        emitError(err);
      }
      try {
        void session
          .supportedAgents()
          .then((agents) =>
            setState({ availableAgents: agents.map((a) => ({ name: a.name, description: a.description })) })
          )
          .catch(emitError);
      } catch (err) {
        emitError(err);
      }
      try {
        void session
          .mcpServerStatus()
          .then((servers) =>
            setState({
              mcpServers: servers.map((s) => ({
                name: s.name,
                status: s.status,
                toolCount: s.tools?.length ?? 0,
                error: s.error,
              })),
            })
          )
          .catch(emitError);
      } catch (err) {
        emitError(err);
      }
      return;
    }

    if (message.type === 'stream_event') {
      handleStreamEvent(message.event);
      return;
    }

    if (message.type === 'assistant') {
      const blocks = message.message.content;
      if (!Array.isArray(blocks)) return;

      const texts: string[] = [];
      for (const block of blocks) {
        if (block.type === 'text') {
          texts.push(block.text);
        } else if (block.type === 'tool_use') {
          record({
            type: 'tool.activity',
            toolUseId: block.id,
            name: block.name,
            target: describeTarget(block.input),
          });
        }
      }

      if (texts.length > 0) {
        record({
          type: 'message.complete',
          messageId: message.message.id,
          role: 'assistant',
          text: texts.join('\n'),
        });
      }
      return;
    }

    if (message.type === 'result') {
      streamingMessageId = null;
      setState({ status: 'idle', sessionId: message.session_id });
      if ('total_cost_usd' in message) {
        record({ type: 'cost.usage', totalUsd: message.total_cost_usd });
      }
      refreshContextUsage('summary');
      return;
    }

    // Émis après une compaction, manuelle (notre '/compact') ou automatique (seuil atteint) : la
    // fenêtre vient de changer, la jauge doit redescendre sans attendre le prochain tour complet
    // (critère de fin de tranche 3, point 2).
    if (message.type === 'system' && message.subtype === 'compact_boundary') {
      refreshContextUsage('summary');
      return;
    }
  }

  // `try`/`catch` en plus du `.catch` : un double de test sans `getContextUsage` ne doit pas faire
  // tomber toute la boucle `pump` (même garde que `supportedModels` plus haut).
  function refreshContextUsage(detail: 'summary' | 'full'): void {
    try {
      void session
        .getContextUsage({ detail })
        .then((usage) => record({ type: 'context.usage', usage: toContextUsage(usage) }))
        .catch(emitError);
    } catch (err) {
      emitError(err);
    }
  }

  function toContextUsage(usage: Awaited<ReturnType<typeof session.getContextUsage>>): ContextUsage {
    return {
      totalTokens: usage.totalTokens,
      maxTokens: usage.maxTokens,
      percentage: usage.percentage,
      categories: usage.categories.map((c) => ({ name: c.name, tokens: c.tokens })),
    };
  }

  function handleStreamEvent(event: SDKPartialAssistantMessage['event']): void {
    if (event.type === 'message_start') {
      streamingMessageId = event.message.id;
      return;
    }
    if (event.type !== 'content_block_delta' || event.delta.type !== 'text_delta') return;
    if (streamingMessageId === null) return;

    record({ type: 'message.delta', messageId: streamingMessageId, text: event.delta.text });
  }

  // Valeurs exactes du SDK (sdk.d.ts:2366 et 623). `bypassPermissions` est volontairement absent de
  // la liste offerte par l'interface : il désarme tout ce que la tranche 2 construit, et un tel
  // choix se prend au terminal, pas en deux clics.
  const MODES_OFFERTS = ['default', 'acceptEdits', 'plan', 'dontAsk', 'auto'] as const;
  const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

  function describeTarget(input: unknown): string | undefined {
    if (typeof input !== 'object' || input === null) return undefined;
    const record = input as Record<string, unknown>;
    for (const key of ['file_path', 'path', 'command', 'pattern']) {
      const value = record[key];
      if (typeof value === 'string') return value;
    }
    return undefined;
  }

  return {
    send(text: string) {
      setState({ status: 'generating' });
      // Le serveur pousse l'état : l'écho du message utilisateur vient d'ici, pas du client.
      record({ type: 'message.complete', messageId: randomUUID(), role: 'user', text });
      queue.push({
        type: 'user',
        message: { role: 'user', content: text },
        parent_tool_use_id: null,
      });
    },

    async interrupt() {
      try {
        await session.interrupt();
      } catch (err) {
        emitError(err);
      }
      setState({ status: 'idle' });
    },

    state: () => state,

    async stop() {
      queue.close();
      await pump;
    },

    respondPermission: (requestId, decision, reason) => {
      permissions.respond(requestId, decision, reason);
    },

    pendingPermissions: () => permissions.pending(),

    grantedPermissions: () => opts.store?.list() ?? [],

    async revokePermission(toolName) {
      await opts.store?.revoke(toolName);
      record({ type: 'permission.granted', granted: opts.store?.list() ?? [] });
    },

    control: () => session,

    history: () => [...history],

    compact() {
      queue.push({
        type: 'user',
        message: { role: 'user', content: '/compact' },
        parent_tool_use_id: null,
      });
    },

    requestContextDetail() {
      refreshContextUsage('full');
    },

    async applyRuntime(reglages: { model?: string; effort?: string; permissionMode?: string }) {
      const patch: Partial<SessionState> = {};

      try {
        if (reglages.permissionMode !== undefined) {
          if (!MODES_OFFERTS.includes(reglages.permissionMode as never)) {
            throw new Error(`Mode de permission non offert : ${reglages.permissionMode}`);
          }
          await session.setPermissionMode(reglages.permissionMode as never);
          patch.permissionMode = reglages.permissionMode;
        }

        if (reglages.model !== undefined) {
          await session.setModel(reglages.model);
          patch.model = reglages.model;
        }

        if (reglages.effort !== undefined) {
          if (!EFFORTS.includes(reglages.effort as never)) {
            throw new Error(`Niveau d'effort inconnu : ${reglages.effort}`);
          }
          await session.applyFlagSettings({ effortLevel: reglages.effort as never });
          patch.effort = reglages.effort;
        }
      } catch (err) {
        emitError(err);
        // On ne pousse que ce qui a réussi avant l'échec : l'état ne doit jamais affirmer un
        // réglage que le SDK a refusé.
      }

      if (Object.keys(patch).length > 0) setState(patch);
    },
  };
}
