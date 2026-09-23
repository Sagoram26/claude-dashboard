import type { CanUseTool, PermissionResult, PermissionUpdate } from '@anthropic-ai/claude-agent-sdk';
import type { PermissionRequest, ServerEvent } from '../protocol.ts';

export type PermissionDecision = 'allow' | 'always' | 'deny';

/**
 * Comme `CanUseTool`, mais sans `| null` au retour. Le SDK admet `null` pour signifier « réponse
 * envoyée hors bande », et documente qu'un `null` accidentel laisse l'outil bloqué indéfiniment
 * (sdk.d.ts:205-211). Ce type interdit le cas au compilateur, au point de définition comme chez
 * les appelants. L'affectation à `CanUseTool` reste valide par covariance du retour — c'est
 * `manager.ts`, en passant la fonction à `query()`, qui le vérifie.
 */
export type BridgeCanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: Parameters<CanUseTool>[2]
) => Promise<PermissionResult>;

export type PermissionBridge = {
  canUseTool: BridgeCanUseTool;
  respond(requestId: string, decision: PermissionDecision, reason?: string): void;
  pending(): PermissionRequest[];
};

type Waiting = {
  request: PermissionRequest;
  suggestions: PermissionUpdate[];
  accordeToutLOutil: boolean;
  settle: (result: PermissionResult) => void;
};

/**
 * « Toujours pour cet outil » ne doit être proposé que si c'est bien ce qui va se passer.
 *
 * Deux conditions, et les deux comptent. `suppressAlwaysAllowRule` dit que le SDK refuse toute
 * règle persistante pour cette demande. Mais son absence ne dit **pas** que la règle suggérée
 * porte sur l'outil entier : `PermissionRuleValue.ruleContent` peut la restreindre à un motif
 * précis, par exemple `Bash(npm test:*)`.
 *
 * Or notre stockage n'enregistre qu'un `toolName`. Si le SDK ne proposait qu'un motif étroit et
 * qu'on enregistrait l'outil entier, la session suivante accorderait bien plus que ce que
 * l'utilisateur a vu et validé. C'est une sur-autorisation silencieuse, et le pire genre : elle
 * ne se manifeste qu'au redémarrage suivant, loin du clic qui l'a causée.
 *
 * Un tableau de suggestions vide signifie que le SDK ne propose rien de plus étroit : l'outil
 * entier est alors la portée honnête.
 */
function accordeToutLOutil(toolName: string, suggestions: PermissionUpdate[]): boolean {
  if (suggestions.length === 0) return true;
  return suggestions.some(
    (suggestion) =>
      (suggestion.type === 'addRules' || suggestion.type === 'replaceRules') &&
      suggestion.behavior === 'allow' &&
      suggestion.rules.some((rule) => rule.toolName === toolName && rule.ruleContent === undefined)
  );
}

/**
 * Le SDK pose ces trois champs quand une régle persistante ne doit PAS remplacer cette demande
 * précise : `suppressAlwaysAllowRule` dit qu'une règle large dépasserait cette action (chemin
 * hors du dossier de travail, écriture dans `.claude/`…), `matchedAskRule` dit qu'une règle
 * `permissions.ask` posée par l'utilisateur force ce prompt — une intention humaine explicite,
 * pas un défaut — et `defaultToNo` marque une demande sensible. Le court-circuit sur permission
 * persistante ne doit jamais passer outre : sinon un clic « Toujours » sur un outil anodin
 * ouvrirait, plus tard, l'écriture de `.claude/settings.json` ou d'un fichier hors du dossier de
 * travail sans jamais reposer la question.
 */
function doitQuandMemeDemander(options: {
  suppressAlwaysAllowRule?: boolean;
  matchedAskRule?: unknown;
  defaultToNo?: boolean;
}): boolean {
  return (
    options.suppressAlwaysAllowRule === true ||
    options.matchedAskRule != null ||
    options.defaultToNo === true
  );
}

/**
 * « Toujours pour cet outil » ne promet que la session en cours : le dashboard tient déjà sa
 * propre persistance (permission-store.ts). Renvoyer les suggestions du SDK telles quelles
 * écrirait potentiellement dans `.claude/settings.json` (destination `userSettings` /
 * `projectSettings` / `localSettings`) ou élargirait la session via `setMode` / `addDirectories`
 * — des effets que le bouton ne montre jamais à l'utilisateur. On ne repasse que les règles
 * d'autorisation, forcées sur `session`.
 */
function permissionsPourLaSession(suggestions: PermissionUpdate[]): PermissionUpdate[] {
  return suggestions
    .filter(
      (s): s is Extract<PermissionUpdate, { type: 'addRules' | 'replaceRules' }> =>
        (s.type === 'addRules' || s.type === 'replaceRules') && s.behavior === 'allow'
    )
    .map((s) => ({ ...s, destination: 'session' }));
}

export function createPermissionBridge(opts: {
  emit: (event: ServerEvent) => void;
  onPendingChange?: (count: number) => void;
  isGranted?: (toolName: string) => boolean;
  onGrant?: (toolName: string) => void;
}): PermissionBridge {
  const waiting = new Map<string, Waiting>();

  const notifyPendingChange = () => opts.onPendingChange?.(waiting.size);

  // Le type de retour est volontairement `Promise<PermissionResult>` et non
  // `Promise<PermissionResult | null>` comme le déclare `CanUseTool`. La covariance du retour
  // rend l'affectation valide, et le compilateur refuse désormais `null` ici — un `null` accidentel
  // laisserait l'outil bloqué indéfiniment (sdk.d.ts:205-211).
  const canUseTool = (
    toolName: string,
    input: Record<string, unknown>,
    options: Parameters<CanUseTool>[2]
  ): Promise<PermissionResult> => {
    // Court-circuit : la toute première chose faite, avant la moindre promesse suspendue.
    // Sauf si le SDK dit lui-même qu'une règle persistante ne couvre pas cette demande précise.
    if (opts.isGranted?.(toolName) && !doitQuandMemeDemander(options)) {
      return Promise.resolve({ behavior: 'allow' });
    }

    return new Promise<PermissionResult>((resolve) => {
      const suggestions = options.suggestions ?? [];
      const toutLOutil = accordeToutLOutil(toolName, suggestions);

      const request: PermissionRequest = {
        requestId: options.requestId,
        toolUseId: options.toolUseID,
        toolName,
        title: options.title,
        displayName: options.displayName,
        description: options.description,
        input,
        canAlwaysAllow: !options.suppressAlwaysAllowRule && toutLOutil,
        defaultToNo: options.defaultToNo === true,
        mcpServer: options.mcpServer,
      };

      const settle = (result: PermissionResult) => {
        if (!waiting.delete(options.requestId)) return;
        notifyPendingChange();
        resolve(result);
      };

      waiting.set(options.requestId, {
        request,
        suggestions,
        accordeToutLOutil: toutLOutil,
        settle,
      });
      notifyPendingChange();

      // Un abandon côté SDK doit refuser, jamais laisser la promesse suspendue — et le client doit
      // en être informé : sans `permission.resolved`, le bloc d'approbation et le rappel ancré
      // restent actionnables indéfiniment, alors que la demande qu'ils portent n'existe plus.
      options.signal.addEventListener(
        'abort',
        () => {
          opts.emit({ type: 'permission.resolved', requestId: options.requestId, decision: 'deny' });
          settle({ behavior: 'deny', message: 'Demande abandonnée.' });
        },
        { once: true }
      );

      opts.emit({ type: 'permission.request', request });
    });
  };

  return {
    canUseTool,

    respond(requestId, decision, reason) {
      const entry = waiting.get(requestId);
      if (!entry) return;

      // `permission.resolved` part AVANT `settle`, et l'ordre compte.
      //
      // `settle` vide la map, ce qui déclenche `onPendingChange(0)`, ce qui fait basculer le statut
      // en `generating` et émet un `session.state`. Si cet événement partait le premier, le client
      // afficherait l'indicateur de génération alors que le rappel d'approbation est encore là —
      // deux éléments `role="status"` dans le DOM au même instant, et un rappel qui survit une
      // image de trop à une décision déjà prise.
      //
      // En annonçant la décision d'abord, le rappel disparaît avant que l'indicateur n'apparaisse.
      opts.emit({ type: 'permission.resolved', requestId, decision });

      if (decision === 'deny') {
        entry.settle({ behavior: 'deny', message: reason ?? 'Refusé depuis le dashboard.' });
      } else if (decision === 'always') {
        // Deuxième garde, volontairement redondante avec `canAlwaysAllow`. Celle-là masque le
        // bouton dans l'interface ; celle-ci refuse d'enregistrer même si la commande arrive
        // quand même. Une décision de portée ne se délègue pas au client.
        // Les `updatedPermissions` partent dans tous les cas : le SDK, lui, sait appliquer une
        // règle étroite, et elle vaut pour la session en cours.
        if (entry.accordeToutLOutil) opts.onGrant?.(entry.request.toolName);
        entry.settle({ behavior: 'allow', updatedPermissions: permissionsPourLaSession(entry.suggestions) });
      } else {
        entry.settle({ behavior: 'allow' });
      }
    },

    pending: () => [...waiting.values()].map((entry) => entry.request),
  };
}
