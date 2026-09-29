import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflowExecutor } from './executor.ts';
import type { WorkflowDefinition, WorkflowCheckpoint } from '../protocol.ts';

function fakeDeps() {
  const applyRuntimeCalls: Record<string, unknown>[] = [];
  const sendCalls: string[] = [];
  const checkpoints: WorkflowCheckpoint[] = [];
  let waitForTurnEndResolvers: (() => void)[] = [];

  return {
    applyRuntimeCalls,
    sendCalls,
    checkpoints,
    resolveTurn: () => {
      const resolvers = waitForTurnEndResolvers;
      waitForTurnEndResolvers = [];
      for (const r of resolvers) r();
    },
    deps: {
      applyRuntime: async (r: Record<string, unknown>) => {
        applyRuntimeCalls.push(r);
      },
      send: (text: string) => {
        sendCalls.push(text);
      },
      waitForTurnEnd: () =>
        new Promise<void>((resolve) => {
          waitForTurnEndResolvers.push(resolve);
        }),
      emitCheckpoint: (checkpoint: WorkflowCheckpoint) => {
        checkpoints.push(checkpoint);
      },
    },
  };
}

function workflow(steps: WorkflowDefinition['steps']): WorkflowDefinition {
  return { id: 'wf1', name: 'test workflow', steps };
}

test('start() enchaîne 3 étapes sans barrière jusqu\'à done', async () => {
  const f = fakeDeps();
  const executor = createWorkflowExecutor(f.deps);
  const wf = workflow([
    { id: 's1', label: 'Étape 1', prompt: 'p1', gate: false },
    { id: 's2', label: 'Étape 2', prompt: 'p2', gate: false },
    { id: 's3', label: 'Étape 3', prompt: 'p3', gate: false },
  ]);

  const started = executor.start(wf);
  // Résout chaque tour l'un après l'autre, en laissant le microtask queue avancer.
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setImmediate(r));
    f.resolveTurn();
  }
  await started;

  assert.equal(f.applyRuntimeCalls.length, 3);
  assert.equal(f.sendCalls.length, 3);
  assert.deepEqual(f.sendCalls, ['p1', 'p2', 'p3']);
  assert.equal(f.checkpoints.length, 6);
  assert.deepEqual(
    f.checkpoints.map((c) => `${c.id}:${c.status}`),
    ['s1:running', 's1:done', 's2:running', 's2:done', 's3:running', 's3:done']
  );
  assert.deepEqual(
    f.checkpoints.map((c) => `${c.stepIndex}/${c.totalSteps}`),
    ['0/3', '0/3', '1/3', '1/3', '2/3', '2/3']
  );
  assert.equal(executor.state()?.status, 'done');
});

test('start() s\'arrête sur la barrière de l\'étape 2 (index 1)', async () => {
  const f = fakeDeps();
  const executor = createWorkflowExecutor(f.deps);
  const wf = workflow([
    { id: 's1', label: 'Étape 1', prompt: 'p1', gate: false },
    { id: 's2', label: 'Étape 2', prompt: 'p2', gate: true },
    { id: 's3', label: 'Étape 3', prompt: 'p3', gate: false },
  ]);

  const started = executor.start(wf);
  for (let i = 0; i < 2; i++) {
    await new Promise((r) => setImmediate(r));
    f.resolveTurn();
  }
  await started;

  assert.equal(f.applyRuntimeCalls.length, 2);
  assert.equal(f.sendCalls.length, 2);
  assert.equal(f.checkpoints.length, 5);
  assert.deepEqual(
    f.checkpoints.map((c) => `${c.id}:${c.status}`),
    ['s1:running', 's1:done', 's2:running', 's2:done', 's2:gate']
  );
  assert.deepEqual(
    f.checkpoints.map((c) => `${c.stepIndex}/${c.totalSteps}`),
    ['0/3', '0/3', '1/3', '1/3', '1/3']
  );
  const gateCheckpoint = f.checkpoints[4]!;
  assert.equal('durationMs' in gateCheckpoint, false);
  assert.equal(executor.state()?.status, 'gated');
  assert.equal(executor.state()?.currentStepIndex, 1);
});

test('continueAfterGate() reprend à l\'étape 3 et termine', async () => {
  const f = fakeDeps();
  const executor = createWorkflowExecutor(f.deps);
  const wf = workflow([
    { id: 's1', label: 'Étape 1', prompt: 'p1', gate: false },
    { id: 's2', label: 'Étape 2', prompt: 'p2', gate: true },
    { id: 's3', label: 'Étape 3', prompt: 'p3', gate: false },
  ]);

  const started = executor.start(wf);
  for (let i = 0; i < 2; i++) {
    await new Promise((r) => setImmediate(r));
    f.resolveTurn();
  }
  await started;

  const resumed = executor.continueAfterGate();
  await new Promise((r) => setImmediate(r));
  f.resolveTurn();
  await resumed;

  assert.equal(f.applyRuntimeCalls.length, 3);
  assert.equal(f.sendCalls.length, 3);
  assert.deepEqual(f.sendCalls, ['p1', 'p2', 'p3']);
  assert.deepEqual(
    f.checkpoints.map((c) => `${c.id}:${c.status}`),
    ['s1:running', 's1:done', 's2:running', 's2:done', 's2:gate', 's3:running', 's3:done']
  );
  assert.equal(executor.state()?.status, 'done');
});

test('correctAtGate() ne relance rien et laisse l\'état gated', async () => {
  const f = fakeDeps();
  const executor = createWorkflowExecutor(f.deps);
  const wf = workflow([
    { id: 's1', label: 'Étape 1', prompt: 'p1', gate: true },
    { id: 's2', label: 'Étape 2', prompt: 'p2', gate: false },
  ]);

  const started = executor.start(wf);
  await new Promise((r) => setImmediate(r));
  f.resolveTurn();
  await started;

  assert.equal(f.applyRuntimeCalls.length, 1);
  assert.equal(f.sendCalls.length, 1);
  assert.deepEqual(
    f.checkpoints.map((c) => `${c.id}:${c.status}`),
    ['s1:running', 's1:done', 's1:gate']
  );

  executor.correctAtGate();

  assert.equal(f.applyRuntimeCalls.length, 1);
  assert.equal(f.sendCalls.length, 1);
  assert.equal(executor.state()?.status, 'gated');
});

test('continueAfterGate() et correctAtGate() hors état gated ne font rien (pas d\'exception)', async () => {
  const f = fakeDeps();
  const executor = createWorkflowExecutor(f.deps);

  assert.doesNotThrow(() => executor.correctAtGate());
  await assert.doesNotReject(() => executor.continueAfterGate());
  assert.equal(f.applyRuntimeCalls.length, 0);
  assert.equal(f.sendCalls.length, 0);
});

// I2 : le nombre d'appels a applyRuntime ne prouve pas que le REGLAGE de chaque etape est
// applique. Verifie le contenu, pas seulement le compte.
test('applyRuntime recoit le model de CHAQUE etape, pas seulement celui de la premiere', async () => {
  const f = fakeDeps();
  const executor = createWorkflowExecutor(f.deps);
  const wf = workflow([
    { id: 's1', label: 'Étape 1', prompt: 'p1', model: 'model-a', gate: false },
    { id: 's2', label: 'Étape 2', prompt: 'p2', model: 'model-b', gate: false },
    { id: 's3', label: 'Étape 3', prompt: 'p3', model: 'model-c', gate: false },
  ]);

  const started = executor.start(wf);
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setImmediate(r));
    f.resolveTurn();
  }
  await started;

  assert.equal(f.applyRuntimeCalls.length, 3);
  assert.equal(f.applyRuntimeCalls[0]?.model, 'model-a');
  assert.equal(f.applyRuntimeCalls[1]?.model, 'model-b');
  assert.equal(f.applyRuntimeCalls[2]?.model, 'model-c');
});

// B2 : internalState.status restait 'gated' pendant toute l'etape suivante (jusqu'a la prochaine
// barriere ou 'done'), donc un second appel a continueAfterGate() (double-clic, ou un vieux
// bouton reste affiche) relancait runFrom(i+1) une deuxieme fois EN PARALLELE.
test("continueAfterGate() appele deux fois de suite n avance pas deux fois (B2)", async () => {
  const f = fakeDeps();
  const executor = createWorkflowExecutor(f.deps);
  const wf = workflow([
    { id: 's1', label: 'Étape 1', prompt: 'p1', gate: true },
    { id: 's2', label: 'Étape 2', prompt: 'p2', gate: false },
  ]);

  const started = executor.start(wf);
  await new Promise((r) => setImmediate(r));
  f.resolveTurn();
  await started;

  assert.equal(executor.state()?.status, 'gated');

  // Double appel synchrone, comme un double-clic : le second doit voir un etat deja 'running' et
  // ne rien refaire.
  const premier = executor.continueAfterGate();
  const second = executor.continueAfterGate();

  await new Promise((r) => setImmediate(r));
  f.resolveTurn();
  await Promise.all([premier, second]);

  assert.equal(f.sendCalls.length, 2, "l'etape 2 ne doit etre envoyee qu'une seule fois");
  assert.deepEqual(f.sendCalls, ['p1', 'p2']);
  assert.equal(
    f.checkpoints.filter((c) => c.id === 's2' && c.status === 'running').length,
    1,
    "un seul checkpoint 'running' pour s2, pas deux executions paralleles"
  );
  assert.equal(executor.state()?.status, 'done');
});

test('une étape sans model/permissionMode/subagent ne passe pas ces clés à applyRuntime', async () => {
  const f = fakeDeps();
  const executor = createWorkflowExecutor(f.deps);
  const wf = workflow([{ id: 's1', label: 'Étape 1', prompt: 'p1', gate: false }]);

  const started = executor.start(wf);
  await new Promise((r) => setImmediate(r));
  f.resolveTurn();
  await started;

  assert.equal(f.applyRuntimeCalls.length, 1);
  const call = f.applyRuntimeCalls[0]!;
  assert.equal('model' in call, false);
  assert.equal('permissionMode' in call, false);
});

test('checkpoint running est émis avant send, done après waitForTurnEnd résolu', async () => {
  const f = fakeDeps();
  const events: string[] = [];
  const originalSend = f.deps.send;
  const originalWait = f.deps.waitForTurnEnd;
  f.deps.send = (text: string) => {
    events.push('send');
    originalSend(text);
  };
  f.deps.waitForTurnEnd = () => {
    events.push('waitForTurnEnd:start');
    return originalWait().then(() => {
      events.push('waitForTurnEnd:end');
    });
  };
  f.deps.emitCheckpoint = (checkpoint: WorkflowCheckpoint) => {
    events.push(`checkpoint:${checkpoint.status}`);
    f.checkpoints.push(checkpoint);
  };

  const executor = createWorkflowExecutor(f.deps);
  const wf = workflow([{ id: 's1', label: 'Étape 1', prompt: 'p1', gate: false }]);

  const started = executor.start(wf);
  await new Promise((r) => setImmediate(r));
  f.resolveTurn();
  await started;

  assert.deepEqual(events, [
    'checkpoint:running',
    'send',
    'waitForTurnEnd:start',
    'waitForTurnEnd:end',
    'checkpoint:done',
  ]);
});

test('le checkpoint gate est émis juste après le done de l\'étape barrée, avant toute étape suivante', async () => {
  const f = fakeDeps();
  const events: string[] = [];
  const originalSend = f.deps.send;
  f.deps.send = (text: string) => {
    events.push(`send:${text}`);
    originalSend(text);
  };
  f.deps.emitCheckpoint = (checkpoint: WorkflowCheckpoint) => {
    events.push(`checkpoint:${checkpoint.id}:${checkpoint.status}`);
    f.checkpoints.push(checkpoint);
  };

  const executor = createWorkflowExecutor(f.deps);
  const wf = workflow([
    { id: 's1', label: 'Étape 1', prompt: 'p1', gate: true },
    { id: 's2', label: 'Étape 2', prompt: 'p2', gate: false },
  ]);

  const started = executor.start(wf);
  await new Promise((r) => setImmediate(r));
  f.resolveTurn();
  await started;

  // start() résout sur l'état gated : seule l'étape 1 a tourné, le checkpoint gate est déjà
  // là, et rien de l'étape 2 n'a encore commencé.
  assert.deepEqual(events, ['checkpoint:s1:running', 'send:p1', 'checkpoint:s1:done', 'checkpoint:s1:gate']);
  assert.equal(executor.state()?.status, 'gated');

  const resumed = executor.continueAfterGate();
  await new Promise((r) => setImmediate(r));
  f.resolveTurn();
  await resumed;

  assert.deepEqual(events, [
    'checkpoint:s1:running',
    'send:p1',
    'checkpoint:s1:done',
    'checkpoint:s1:gate',
    'checkpoint:s2:running',
    'send:p2',
    'checkpoint:s2:done',
  ]);
});
