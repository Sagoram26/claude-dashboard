export type ServerEvent =
  | { type: 'session.state'; state: SessionState }
  | { type: 'message.delta'; messageId: string; text: string }
  | { type: 'message.complete'; messageId: string; role: 'user' | 'assistant'; text: string }
  | { type: 'tool.activity'; toolUseId: string; name: string; target?: string }
  | { type: 'permission.request'; request: PermissionRequest }
  | { type: 'permission.resolved'; requestId: string; decision: 'allow' | 'always' | 'deny' }
  | { type: 'permission.granted'; granted: GrantedPermission[] }
  | { type: 'workflow.checkpoint'; checkpoint: WorkflowCheckpoint }
  | { type: 'files.changed'; files: ChangedFile[] }
  | { type: 'git.state'; git: GitState }
  | { type: 'context.usage'; usage: ContextUsage }
  | { type: 'cost.usage'; totalUsd: number }
  | { type: 'error'; message: string };

export type ClientCommand =
  | { type: 'message.send'; text: string }
  | { type: 'session.interrupt' }
  | { type: 'runtime.set'; model?: string; effort?: string; permissionMode?: string }
  /**
   * `'always'` n'existe dans aucune énumération du SDK : c'est un concept d'interface propre au
   * dashboard, traduit côté serveur en `{behavior: 'allow', updatedPermissions: suggestions}`.
   * Ne pas le chercher dans `PermissionBehavior` ni dans `PermissionResult`.
   */
  | { type: 'permission.respond'; requestId: string; decision: 'allow' | 'always' | 'deny'; reason?: string }
  | { type: 'permission.revoke'; toolName: string }
  | { type: 'workflow.start'; workflowId: string }
  | { type: 'workflow.resume'; checkpointId: string }
  | { type: 'context.compact' };

export type SessionState = {
  sessionId: string | null;
  cwd: string;
  status: 'idle' | 'generating' | 'awaiting-permission' | 'disconnected';
  model: string | null;
  permissionMode: string | null;
  effort: string | null;
  /** Peuplé par `query.supportedModels()`. Vide tant que la session n'est pas établie. */
  availableModels: { value: string; displayName: string }[];
};

export type PermissionRequest = {
  requestId: string;
  /** Vient de `options.toolUseID` du SDK — casse différente, volontaire : tout le protocole est en camelCase. */
  toolUseId: string;
  toolName: string;
  title?: string;
  displayName?: string;
  description?: string;
  input: Record<string, unknown>;
  /**
   * Dérivé : `!options.suppressAlwaysAllowRule`. Le SDK expose l'inverse ; l'inversion est faite
   * une fois ici plutôt que dans chaque composant qui lira le champ.
   */
  canAlwaysAllow: boolean;
  /**
   * Vrai quand le SDK interdit qu'une frappe parasite approuve la demande : pas de raccourci
   * d'approbation à une touche, et le focus va sur le refus.
   */
  defaultToNo: boolean;
  /** Présent pour les outils `mcp__*`. `name` est du texte non fiable : ne jamais l'insérer en HTML brut. */
  mcpServer?: { name: string; source: string };
};

export type GrantedPermission = {
  toolName: string;
  /** ISO 8601. Sert à l'affichage dans les réglages, pas à une expiration : rien n'expire. */
  grantedAt: string;
};

export type WorkflowCheckpoint = {
  id: string;
  label: string;
  status: 'done' | 'running' | 'gate';
  model?: string;
  durationMs?: number;
};

export type ChangedFile = { path: string; added: number; removed: number };

export type GitState = { branch: string; dirty: number; staged: number };

export type ContextUsage = {
  totalTokens: number;
  maxTokens: number;
  percentage: number;
  categories: { name: string; tokens: number }[];
};

const COMMAND_VALIDATORS: Record<ClientCommand['type'], (v: Record<string, unknown>) => boolean> = {
  'message.send': (v) => typeof v.text === 'string' && v.text.length > 0,
  'session.interrupt': () => true,
  'runtime.set': (v) =>
    (v.model === undefined || typeof v.model === 'string') &&
    (v.effort === undefined || typeof v.effort === 'string') &&
    (v.permissionMode === undefined || typeof v.permissionMode === 'string'),
  'permission.respond': (v) =>
    typeof v.requestId === 'string' &&
    (v.decision === 'allow' || v.decision === 'always' || v.decision === 'deny'),
  'permission.revoke': (v) => typeof v.toolName === 'string' && v.toolName.length > 0,
  'workflow.start': (v) => typeof v.workflowId === 'string',
  'workflow.resume': (v) => typeof v.checkpointId === 'string',
  'context.compact': () => true,
};

export function parseClientCommand(raw: string): ClientCommand | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const candidate = parsed as Record<string, unknown>;
  const type = candidate.type;
  if (typeof type !== 'string') return null;

  const validate = COMMAND_VALIDATORS[type as ClientCommand['type']];
  if (!validate || !validate(candidate)) return null;

  return candidate as unknown as ClientCommand;
}
