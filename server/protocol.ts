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
  | { type: 'error'; message: string }
  | { type: 'workflows.list'; workflows: WorkflowDefinition[] }
  | { type: 'prompts.list'; prompts: PromptDefinition[] };

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
  | { type: 'workflow.resume'; checkpointId: string; action: 'continue' | 'correct' }
  | { type: 'workflow.save'; workflow: WorkflowDefinition }
  | { type: 'workflow.delete'; id: string }
  | { type: 'prompt.save'; prompt: PromptDefinition }
  | { type: 'prompt.delete'; id: string }
  | { type: 'context.compact' }
  /** `detail: 'full'` : réservé à l'ouverture du popover de contexte, jamais au rafraîchissement de la jauge. */
  | { type: 'context.request-full' };

export type SessionState = {
  sessionId: string | null;
  cwd: string;
  status: 'idle' | 'generating' | 'awaiting-permission' | 'disconnected';
  model: string | null;
  permissionMode: string | null;
  effort: string | null;
  /** Peuplé par `query.supportedModels()`. Vide tant que la session n'est pas établie. */
  availableModels: { value: string; displayName: string }[];
  /** Peuplé par `query.supportedCommands()` (les skills, malgré le nom du type SDK). */
  availableCommands: { name: string; description: string }[];
  /** Peuplé par `query.supportedAgents()`. */
  availableAgents: { name: string; description: string }[];
  /**
   * Peuplé par `query.mcpServerStatus()` une fois à l'initialisation. Un serveur hors ligne
   * apparaît ici avec son `status` réel ('failed' | 'needs-auth' | 'pending' | 'disabled') :
   * ne jamais filtrer dessus côté rendu, le critère de fin de tranche 3 l'exige explicitement.
   */
  mcpServers: { name: string; status: string; toolCount: number; error?: string }[];
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
  stepIndex: number;
  totalSteps: number;
  /**
   * Reflète `WorkflowStep.gate` de l'étape source. Permet au client de savoir, dès le `'done'`,
   * si un checkpoint `'gate'` suit pour ce même id — sans quoi le `'done'` de la dernière étape
   * d'un workflow barré serait indiscernable d'une vraie fin de workflow.
   */
  gate: boolean;
};

export type WorkflowStep = {
  id: string;
  label: string;
  /** Instruction envoyée à l'agent au démarrage de l'étape. */
  prompt: string;
  model?: string;
  permissionMode?: string;
  /** Nom d'un subagent dédié à l'étape ; absent = agent principal. */
  subagent?: string;
  /** Barrière optionnelle : suspend l'exécution en fin d'étape, attend un feu vert. */
  gate: boolean;
};

export type WorkflowDefinition = {
  id: string;
  name: string;
  steps: WorkflowStep[];
};

export type PromptDefinition = {
  id: string;
  name: string;
  text: string;
  pinned: boolean;
};

export type ChangedFile = { path: string; added: number; removed: number };

export type GitState = { branch: string; dirty: number; staged: number };

export type ContextUsage = {
  totalTokens: number;
  maxTokens: number;
  percentage: number;
  categories: { name: string; tokens: number }[];
};

/**
 * B4 (revue finale de branche tranche 4) : `id` (et `workflowId`/`checkpointId`) finit concatene
 * tel quel dans un chemin de fichier cote serveur (`server/workflows/store.ts`,
 * `server/prompts/store.ts` : `join(dir, \`${id}.json\`)`). Sans ce filtre, un id du style
 * `../../.claude/settings` permettrait d'ecrire ou d'effacer un fichier arbitraire hors du dossier
 * de stockage. Refuse tout ce qui n'est pas lettres/chiffres/tiret/underscore.
 */
const ID_SUR = /^[\w-]+$/;

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
  'workflow.start': (v) => typeof v.workflowId === 'string' && ID_SUR.test(v.workflowId),
  'workflow.resume': (v) =>
    typeof v.checkpointId === 'string' &&
    ID_SUR.test(v.checkpointId) &&
    (v.action === 'continue' || v.action === 'correct'),
  'workflow.save': (v) =>
    typeof v.workflow === 'object' &&
    v.workflow !== null &&
    typeof (v.workflow as Record<string, unknown>).id === 'string' &&
    ID_SUR.test((v.workflow as Record<string, unknown>).id as string) &&
    typeof (v.workflow as Record<string, unknown>).name === 'string',
  'workflow.delete': (v) => typeof v.id === 'string' && ID_SUR.test(v.id),
  'prompt.save': (v) =>
    typeof v.prompt === 'object' &&
    v.prompt !== null &&
    typeof (v.prompt as Record<string, unknown>).id === 'string' &&
    ID_SUR.test((v.prompt as Record<string, unknown>).id as string) &&
    typeof (v.prompt as Record<string, unknown>).name === 'string',
  'prompt.delete': (v) => typeof v.id === 'string' && ID_SUR.test(v.id),
  'context.compact': () => true,
  'context.request-full': () => true,
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

  if (!Object.hasOwn(COMMAND_VALIDATORS, type)) return null;
  const validate = COMMAND_VALIDATORS[type as ClientCommand['type']];
  if (!validate(candidate)) return null;

  return candidate as unknown as ClientCommand;
}
