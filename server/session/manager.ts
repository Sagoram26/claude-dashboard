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
import type { ServerEvent, SessionState, PermissionRequest, GrantedPermission } from '../protocol.ts';

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
};

export function createSessionManager(opts: SessionManagerOptions): SessionManager {
  const queryFn = opts.queryFn ?? realQuery;
  const queue = createMessageQueue<SDKUserMessage>();

  let state: SessionState = {
    sessionId: null,
    cwd: opts.cwd,
    status: 'idle',
    model: null,
    permissionMode: null,
  };

  // Identifiant du message assistant en cours de streaming. C'est l'id de message de l'API
  // (message_start), le même que celui porté par le SDKAssistantMessage final : les deltas et le
  // complete doivent coïncider, sinon le client affiche le texte deux fois.
  let streamingMessageId: string | null = null;

  const setState = (patch: Partial<SessionState>) => {
    state = { ...state, ...patch };
    opts.emit({ type: 'session.state', state });
  };

  const emitError = (err: unknown) => {
    opts.emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  };

  const permissions = createPermissionBridge({
    emit: opts.emit,
    onPendingChange: (count) => {
      if (count > 0) setState({ status: 'awaiting-permission' });
      else if (state.status === 'awaiting-permission') setState({ status: 'generating' });
    },
    isGranted: (toolName) => opts.store?.isGranted(toolName) ?? false,
    onGrant: (toolName) => {
      void opts.store?.grant(toolName).then(() => {
        opts.emit({ type: 'permission.granted', granted: opts.store?.list() ?? [] });
      });
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
          opts.emit({
            type: 'tool.activity',
            toolUseId: block.id,
            name: block.name,
            target: describeTarget(block.input),
          });
        }
      }

      if (texts.length > 0) {
        opts.emit({
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
        opts.emit({ type: 'cost.usage', totalUsd: message.total_cost_usd });
      }
    }
  }

  function handleStreamEvent(event: SDKPartialAssistantMessage['event']): void {
    if (event.type === 'message_start') {
      streamingMessageId = event.message.id;
      return;
    }
    if (event.type !== 'content_block_delta' || event.delta.type !== 'text_delta') return;
    if (streamingMessageId === null) return;

    opts.emit({ type: 'message.delta', messageId: streamingMessageId, text: event.delta.text });
  }

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
      opts.emit({ type: 'message.complete', messageId: randomUUID(), role: 'user', text });
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
      opts.emit({ type: 'permission.granted', granted: opts.store?.list() ?? [] });
    },

    control: () => session,
  };
}
