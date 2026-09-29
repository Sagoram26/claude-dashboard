import type {
  ChangedFile,
  ContextUsage,
  GitState,
  GrantedPermission,
  PermissionRequest,
  PromptDefinition,
  ServerEvent,
  SessionState,
  WorkflowCheckpoint,
  WorkflowDefinition,
} from '../../server/protocol.ts';

export type ChatMessage = {
  kind: 'message';
  id: string;
  role: 'user' | 'assistant';
  text: string;
  streaming: boolean;
};

export type ApprovalEntry = {
  kind: 'approval';
  id: string;
  request: PermissionRequest;
  /** `null` tant que l'utilisateur n'a pas tranché. Le bloc reste dans le fil après la décision. */
  decision: 'allow' | 'always' | 'deny' | null;
};

export type CheckpointEntry = {
  kind: 'checkpoint';
  /** `${checkpoint.id}-${checkpoint.status}` : running/done/gate du même id sont 3 entrées distinctes. */
  id: string;
  checkpoint: WorkflowCheckpoint;
};

export type ThreadEntry = ChatMessage | ApprovalEntry | CheckpointEntry;

export type AppState = {
  thread: ThreadEntry[];
  status: SessionState['status'];
  /** Rappel d'étape courante pour la barre supérieure ; `null` hors workflow. */
  currentWorkflowStep: { index: number; total: number; label: string } | null;
  toolActivityCount: number;
  error: string | null;
  granted: GrantedPermission[];
  model: SessionState['model'];
  effort: SessionState['effort'];
  permissionMode: SessionState['permissionMode'];
  availableModels: SessionState['availableModels'];
  contextUsage: ContextUsage | null;
  costUsd: number;
  git: GitState | null;
  changedFiles: ChangedFile[];
  availableCommands: SessionState['availableCommands'];
  availableAgents: SessionState['availableAgents'];
  mcpServers: SessionState['mcpServers'];
  cwd: string;
  workflows: WorkflowDefinition[];
  prompts: PromptDefinition[];
};

export const initialState: AppState = {
  thread: [],
  status: 'idle',
  currentWorkflowStep: null,
  toolActivityCount: 0,
  error: null,
  granted: [],
  model: null,
  effort: null,
  permissionMode: null,
  availableModels: [],
  contextUsage: null,
  costUsd: 0,
  git: null,
  changedFiles: [],
  availableCommands: [],
  availableAgents: [],
  mcpServers: [],
  cwd: '',
  workflows: [],
  prompts: [],
};

export function reduceEvent(state: AppState, event: ServerEvent): AppState {
  switch (event.type) {
    case 'message.delta': {
      const index = state.thread.findIndex((e) => e.kind === 'message' && e.id === event.messageId);
      if (index === -1) {
        return {
          ...state,
          thread: [
            ...state.thread,
            { kind: 'message', id: event.messageId, role: 'assistant', text: event.text, streaming: true },
          ],
        };
      }
      const thread = [...state.thread];
      const existing = thread[index];
      if (!existing || existing.kind !== 'message') return state;
      thread[index] = { ...existing, text: existing.text + event.text };
      return { ...state, thread };
    }

    case 'message.complete': {
      const index = state.thread.findIndex((e) => e.kind === 'message' && e.id === event.messageId);
      const settled: ChatMessage = {
        kind: 'message',
        id: event.messageId,
        role: event.role,
        text: event.text,
        streaming: false,
      };
      if (index === -1) return { ...state, thread: [...state.thread, settled] };
      const thread = [...state.thread];
      thread[index] = settled;
      return { ...state, thread };
    }

    case 'permission.request': {
      // Le serveur rejoue les demandes en attente à chaque connexion : ne pas dupliquer.
      const already = state.thread.some(
        (e) => e.kind === 'approval' && e.id === event.request.requestId
      );
      if (already) return state;
      return {
        ...state,
        thread: [
          ...state.thread,
          { kind: 'approval', id: event.request.requestId, request: event.request, decision: null },
        ],
      };
    }

    case 'permission.resolved': {
      const index = state.thread.findIndex((e) => e.kind === 'approval' && e.id === event.requestId);
      if (index === -1) return state;
      const thread = [...state.thread];
      const entry = thread[index];
      if (!entry || entry.kind !== 'approval') return state;
      thread[index] = { ...entry, decision: event.decision };
      return { ...state, thread };
    }

    case 'tool.activity':
      return { ...state, toolActivityCount: state.toolActivityCount + 1 };

    case 'session.state':
      return {
        ...state,
        status: event.state.status,
        model: event.state.model,
        effort: event.state.effort,
        permissionMode: event.state.permissionMode,
        availableModels: event.state.availableModels,
        availableCommands: event.state.availableCommands,
        availableAgents: event.state.availableAgents,
        mcpServers: event.state.mcpServers,
        cwd: event.state.cwd,
      };

    case 'error':
      return { ...state, error: event.message };

    case 'permission.granted':
      return { ...state, granted: event.granted };

    case 'context.usage':
      return { ...state, contextUsage: event.usage };

    // `total_cost_usd` est deja cumulatif cote SDK (course en cours du query() courant) : on
    // retient le dernier recu, on ne l additionne jamais a lui-meme sous peine de doubler le cout.
    case 'cost.usage':
      return { ...state, costUsd: event.totalUsd };

    case 'git.state':
      return { ...state, git: event.git };

    case 'files.changed':
      return { ...state, changedFiles: event.files };

    case 'workflows.list':
      return { ...state, workflows: event.workflows };

    case 'prompts.list':
      return { ...state, prompts: event.prompts };

    case 'workflow.checkpoint': {
      const { checkpoint } = event;
      const entry: CheckpointEntry = {
        kind: 'checkpoint',
        id: `${checkpoint.id}-${checkpoint.status}`,
        checkpoint,
      };
      // Règle de mise à jour de currentWorkflowStep (non devinable sans le brief) :
      // - 'running' pose le rappel d'étape sur l'étape qui démarre.
      // - 'gate' le repose explicitement sur sa propre étape (au lieu de se contenter de ne rien
      //   faire) : l'étape affichée reste celle qui vient de suspendre, jusqu'à ce que la suivante
      //   démarre.
      // - 'done' ne le remet à null que s'il s'agit de la dernière étape du workflow
      //   (stepIndex === totalSteps - 1) ET que cette étape ne porte pas de barrière
      //   (`!checkpoint.gate`). Sans ce second critère, le 'done' de la dernière étape d'un
      //   workflow barré effacerait le rappel juste avant que le checkpoint 'gate' qui le suit
      //   n'arrive — alors que le workflow est suspendu, pas terminé. Un 'done' intermédiaire (ni
      //   dernière étape, ni barrière) laisse le rappel inchangé (la prochaine 'running' le mettra
      //   à jour).
      let currentWorkflowStep = state.currentWorkflowStep;
      if (checkpoint.status === 'running' || checkpoint.status === 'gate') {
        currentWorkflowStep = {
          index: checkpoint.stepIndex,
          total: checkpoint.totalSteps,
          label: checkpoint.label,
        };
      } else if (
        checkpoint.status === 'done' &&
        checkpoint.stepIndex === checkpoint.totalSteps - 1 &&
        !checkpoint.gate
      ) {
        currentWorkflowStep = null;
      }
      return { ...state, thread: [...state.thread, entry], currentWorkflowStep };
    }

    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}
