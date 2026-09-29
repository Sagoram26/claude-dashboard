import type { WorkflowCheckpoint, WorkflowDefinition, WorkflowStep } from '../protocol.ts';

export type WorkflowExecutorDeps = {
  applyRuntime: (r: { model?: string; effort?: string; permissionMode?: string }) => Promise<void>;
  send: (text: string) => void;
  /** Résout quand le tour en cours se termine (status revient à 'idle' après avoir été 'generating'). */
  waitForTurnEnd: () => Promise<void>;
  emitCheckpoint: (checkpoint: WorkflowCheckpoint) => void;
};

export type WorkflowExecutorState = {
  workflowId: string;
  currentStepIndex: number;
  status: 'running' | 'gated' | 'done';
};

export function createWorkflowExecutor(deps: WorkflowExecutorDeps) {
  let workflow: WorkflowDefinition | null = null;
  let internalState: WorkflowExecutorState | null = null;

  function runtimeArgs(step: WorkflowStep): { model?: string; permissionMode?: string } {
    const args: { model?: string; permissionMode?: string } = {};
    if (step.model !== undefined) args.model = step.model;
    if (step.permissionMode !== undefined) args.permissionMode = step.permissionMode;
    return args;
  }

  async function runStep(step: WorkflowStep, index: number): Promise<void> {
    const totalSteps = workflow!.steps.length;
    const startedAt = Date.now();
    deps.emitCheckpoint({
      id: step.id,
      label: step.label,
      status: 'running',
      model: step.model,
      stepIndex: index,
      totalSteps,
      gate: step.gate,
    });
    await deps.applyRuntime(runtimeArgs(step));
    deps.send(step.prompt);
    await deps.waitForTurnEnd();
    deps.emitCheckpoint({
      id: step.id,
      label: step.label,
      status: 'done',
      model: step.model,
      durationMs: Date.now() - startedAt,
      stepIndex: index,
      totalSteps,
      gate: step.gate,
    });

    if (step.gate) {
      deps.emitCheckpoint({
        id: step.id,
        label: step.label,
        status: 'gate',
        stepIndex: index,
        totalSteps,
        gate: step.gate,
      });
      internalState = { workflowId: workflow!.id, currentStepIndex: index, status: 'gated' };
      return;
    }

    await runFrom(index + 1);
  }

  async function runFrom(index: number): Promise<void> {
    const steps = workflow!.steps;
    const step = steps[index];
    if (!step) {
      internalState = { workflowId: workflow!.id, currentStepIndex: index - 1, status: 'done' };
      return;
    }
    await runStep(step, index);
  }

  return {
    start(wf: WorkflowDefinition): Promise<void> {
      workflow = wf;
      internalState = { workflowId: wf.id, currentStepIndex: 0, status: 'running' };
      return runFrom(0);
    },

    continueAfterGate(): Promise<void> {
      if (!internalState || internalState.status !== 'gated') return Promise.resolve();
      return runFrom(internalState.currentStepIndex + 1);
    },

    correctAtGate(): void {
      if (!internalState || internalState.status !== 'gated') return;
      // Rend la main sans avancer : n'appelle ni applyRuntime ni send, état inchangé.
    },

    state(): WorkflowExecutorState | null {
      return internalState;
    },
  };
}
