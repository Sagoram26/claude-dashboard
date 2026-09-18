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
  settle: (result: PermissionResult) => void;
};

export function createPermissionBridge(opts: {
  emit: (event: ServerEvent) => void;
  onPendingChange?: (count: number) => void;
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
  ): Promise<PermissionResult> =>
    new Promise<PermissionResult>((resolve) => {
      const request: PermissionRequest = {
        requestId: options.requestId,
        toolUseId: options.toolUseID,
        toolName,
        title: options.title,
        displayName: options.displayName,
        description: options.description,
        input,
        canAlwaysAllow: !options.suppressAlwaysAllowRule,
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
        suggestions: options.suggestions ?? [],
        settle,
      });
      notifyPendingChange();

      // Un abandon côté SDK doit refuser, jamais laisser la promesse suspendue.
      options.signal.addEventListener(
        'abort',
        () => settle({ behavior: 'deny', message: 'Demande abandonnée.' }),
        { once: true }
      );

      opts.emit({ type: 'permission.request', request });
    });

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
        entry.settle({ behavior: 'allow', updatedPermissions: entry.suggestions });
      } else {
        entry.settle({ behavior: 'allow' });
      }
    },

    pending: () => [...waiting.values()].map((entry) => entry.request),
  };
}
