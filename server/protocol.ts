export type ServerEvent =
  | { type: 'session.state'; state: SessionState }
  | { type: 'message.delta'; messageId: string; text: string }
  | { type: 'message.complete'; messageId: string; role: 'user' | 'assistant'; text: string }
  | { type: 'tool.activity'; toolUseId: string; name: string; target?: string }
  | { type: 'permission.request'; request: PermissionRequest }
  | { type: 'permission.resolved'; requestId: string; decision: 'allow' | 'always' | 'deny' }
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
  | { type: 'permission.respond'; requestId: string; decision: 'allow' | 'always' | 'deny'; reason?: string }
  | { type: 'workflow.start'; workflowId: string }
  | { type: 'workflow.resume'; checkpointId: string }
  | { type: 'context.compact' };

export type SessionState = {
  sessionId: string | null;
  cwd: string;
  status: 'idle' | 'generating' | 'awaiting-permission' | 'disconnected';
  model: string | null;
  permissionMode: string | null;
};

export type PermissionRequest = {
  requestId: string;
  toolUseId: string;
  toolName: string;
  title?: string;
  displayName?: string;
  description?: string;
  input: Record<string, unknown>;
  canAlwaysAllow: boolean;
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

const COMMAND_VALIDATORS: Record<string, (v: Record<string, unknown>) => boolean> = {
  'message.send': (v) => typeof v.text === 'string' && v.text.length > 0,
  'session.interrupt': () => true,
  'runtime.set': (v) =>
    (v.model === undefined || typeof v.model === 'string') &&
    (v.effort === undefined || typeof v.effort === 'string') &&
    (v.permissionMode === undefined || typeof v.permissionMode === 'string'),
  'permission.respond': (v) =>
    typeof v.requestId === 'string' &&
    (v.decision === 'allow' || v.decision === 'always' || v.decision === 'deny'),
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

  const validate = COMMAND_VALIDATORS[type];
  if (!validate || !validate(candidate)) return null;

  return candidate as unknown as ClientCommand;
}
