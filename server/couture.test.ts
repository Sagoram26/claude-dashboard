import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createServer } from './index.ts';
import { createSessionManager } from './session/manager.ts';
import { createGitWatcher } from './session/git-watcher.ts';
import { createWorkflowExecutor } from './workflows/executor.ts';
import { reduceEvent, initialState, type AppState } from '../client/src/state.ts';
import { parseClientCommand, type ServerEvent, type WorkflowDefinition } from './protocol.ts';

const execFileAsync = promisify(execFile);

/**
 * Le seul double autorisé ici : le `query` du SDK. Il déclenche `canUseTool` avec des arguments
 * de la forme réelle relevée dans docs/environnement.md — deux positionnels puis un objet
 * d'options — puis rend une réponse selon la décision reçue.
 */
function queryQuiDemandeUnePermission() {
  let declencher: ((options: Record<string, unknown>) => Promise<unknown>) | null = null;

  const query = ({ prompt, options }: { prompt: unknown; options: Record<string, unknown> }) => {
    const canUseTool = options.canUseTool as (
      toolName: string,
      input: Record<string, unknown>,
      opts: Record<string, unknown>
    ) => Promise<{ behavior: string; message?: string }>;

    declencher = (opts) => canUseTool('Bash', { command: 'ls -la' }, opts);

    const generator = (async function* () {
      for await (const _ of prompt as AsyncIterable<unknown>) {
        yield {
          type: 'assistant',
          message: { id: 'msg_1', content: [{ type: 'text', text: 'fait' }] },
          uuid: 'm1',
          session_id: 's1',
        };
        yield { type: 'result', subtype: 'success', total_cost_usd: 0.01, session_id: 's1', uuid: 'r1' };
      }
    })();

    return Object.assign(generator, {
      interrupt: async () => undefined,
      setModel: async () => {},
      setPermissionMode: async () => {},
      applyFlagSettings: async () => {},
      supportedModels: async () => [],
    });
  };

  return { query, trigger: () => declencher };
}

/**
 * Le montage commun à tous les tests de couture : un vrai serveur, un vrai gestionnaire, un vrai
 * pont, un vrai socket client dont les messages passent par le vrai réducteur. Extrait ici pour
 * ne pas le recopier dans chaque test — la plan le demande explicitement.
 */
async function monterCouture() {
  const { query, trigger } = queryQuiDemandeUnePermission();

  let manager: ReturnType<typeof createSessionManager> | null = null;

  const server = await createServer(0, {
    onConnect: (send) => {
      if (manager) send({ type: 'session.state', state: manager.state() });
    },
    onCommand: (cmd) => {
      if (!manager) return;
      if (cmd.type === 'message.send') manager.send(cmd.text);
      if (cmd.type === 'permission.respond') {
        manager.respondPermission(cmd.requestId, cmd.decision, cmd.reason);
      }
    },
  });

  manager = createSessionManager({
    cwd: process.cwd(),
    emit: (event) => server.broadcast(event),
    queryFn: query as never,
  });

  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
  let state: AppState = initialState;
  const recus: ServerEvent[] = [];

  socket.on('message', (raw) => {
    const event = JSON.parse(raw.toString()) as ServerEvent;
    recus.push(event);
    state = reduceEvent(state, event);
  });

  await new Promise((resolve) => socket.on('open', resolve));

  return {
    manager,
    server,
    socket,
    trigger,
    recus,
    state: () => state,
    fermer: async () => {
      socket.close();
      await manager?.stop();
      await server.close();
    },
  };
}

test('une permission traverse le systeme entier et revient', async () => {
  const { socket, trigger, recus, state, fermer } = await monterCouture();

  // 3. Le SDK déclenche canUseTool avec la forme réelle de l'objet d'options.
  const decision = trigger()!({
    signal: new AbortController().signal,
    requestId: 'req-couture',
    toolUseID: 'toolu-couture',
    title: 'Claude veut lancer ls -la',
    suggestions: [
      { type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'session' },
    ],
  });

  await new Promise((r) => setTimeout(r, 50));

  // 4. L'événement a traversé le socket et atteint l'état du client, SANS être écrit à la main.
  const approbations = state().thread.filter((e) => e.kind === 'approval');
  assert.equal(approbations.length, 1, 'la demande doit atteindre l etat du client');

  const entree = approbations[0];
  assert.ok(entree && entree.kind === 'approval');
  assert.equal(entree.request.requestId, 'req-couture');
  assert.equal(entree.request.toolUseId, 'toolu-couture', 'toolUseID -> toolUseId : la casse change en route');
  assert.equal(entree.request.toolName, 'Bash');
  assert.equal(entree.request.title, 'Claude veut lancer ls -la');
  assert.deepEqual(entree.request.input, { command: 'ls -la' });
  assert.equal(entree.request.canAlwaysAllow, true, 'derive de suppressAlwaysAllowRule absent');
  assert.equal(entree.decision, null);

  // 5. La réponse repart en sens inverse, par le protocole réel.
  const commande = { type: 'permission.respond', requestId: entree.id, decision: 'allow' };
  assert.notEqual(parseClientCommand(JSON.stringify(commande)), null, 'la commande doit passer le validateur');
  socket.send(JSON.stringify(commande));

  // 6. Le canUseTool suspendu se débloque.
  const resultat = await Promise.race([
    decision,
    new Promise((_, rejeter) => setTimeout(() => rejeter(new Error('canUseTool jamais resolu')), 2000)),
  ]);
  assert.deepEqual(resultat, { behavior: 'allow' });

  // 7. Et l'état du client porte la décision, toujours dans le fil.
  await new Promise((r) => setTimeout(r, 50));
  const apres = state().thread.filter((e) => e.kind === 'approval');
  assert.equal(apres.length, 1, 'le bloc reste dans le fil apres la decision');
  assert.equal(apres[0]?.kind === 'approval' && apres[0].decision, 'allow');

  // 8. Aucun événement n'a été perdu ni inventé.
  assert.equal(recus.filter((e) => e.type === 'permission.request').length, 1);
  assert.equal(recus.filter((e) => e.type === 'permission.resolved').length, 1);
  assert.equal(recus.filter((e) => e.type === 'error').length, 0);

  await fermer();
});

test('un refus traverse aussi, avec sa raison', async () => {
  const { socket, trigger, state, fermer } = await monterCouture();

  const decision = trigger()!({
    signal: new AbortController().signal,
    requestId: 'req-deny',
    toolUseID: 'toolu-deny',
    title: 'Claude veut lancer rm -rf',
    suggestions: [],
  });

  await new Promise((r) => setTimeout(r, 50));
  const entree = state().thread.find((e) => e.kind === 'approval');
  assert.ok(entree && entree.kind === 'approval');

  socket.send(
    JSON.stringify({
      type: 'permission.respond',
      requestId: entree.id,
      decision: 'deny',
      reason: 'commande destructrice',
    })
  );

  const resultat = await Promise.race([
    decision,
    new Promise((_, rejeter) => setTimeout(() => rejeter(new Error('canUseTool jamais resolu')), 2000)),
  ]);
  assert.deepEqual(resultat, { behavior: 'deny', message: 'commande destructrice' });

  await new Promise((r) => setTimeout(r, 50));
  const apres = state().thread.find((e) => e.kind === 'approval');
  assert.equal(apres?.kind === 'approval' && apres.decision, 'deny');

  await fermer();
});

test('always renvoie au SDK les suggestions qu il avait fournies', async () => {
  const { socket, trigger, state, fermer } = await monterCouture();

  const suggestions = [
    { type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'session' },
  ];

  const decision = trigger()!({
    signal: new AbortController().signal,
    requestId: 'req-always',
    toolUseID: 'toolu-always',
    title: 'Claude veut lancer ls -la',
    suggestions,
  });

  await new Promise((r) => setTimeout(r, 50));
  const entree = state().thread.find((e) => e.kind === 'approval');
  assert.ok(entree && entree.kind === 'approval');

  socket.send(JSON.stringify({ type: 'permission.respond', requestId: entree.id, decision: 'always' }));

  const resultat = await Promise.race([
    decision,
    new Promise((_, rejeter) => setTimeout(() => rejeter(new Error('canUseTool jamais resolu')), 2000)),
  ]);
  assert.deepEqual(
    resultat,
    { behavior: 'allow', updatedPermissions: suggestions },
    'les suggestions renvoyees doivent etre le tableau d origine, jamais une reconstruction'
  );

  await fermer();
});

test('le message de l utilisateur et le streaming traversent aussi', async () => {
  const { socket, state, fermer } = await monterCouture();

  socket.send(JSON.stringify({ type: 'message.send', text: 'salut' }));
  await new Promise((r) => setTimeout(r, 50));

  const messages = state().thread.filter((e) => e.kind === 'message');
  assert.equal(messages.length, 2, 'le message utilisateur et la reponse assistant doivent tous deux etre dans le fil');
  assert.equal(messages[0]?.kind === 'message' && messages[0].role, 'user');
  assert.equal(messages[1]?.kind === 'message' && messages[1].role, 'assistant');
  assert.equal(messages[1]?.kind === 'message' && messages[1].text, 'fait');

  await fermer();
});

/**
 * Un `query` qui répond à CHAQUE message reçu du flux `prompt` (pas seulement le premier) : un
 * workflow envoie plusieurs tours successifs, chacun doit produire sa propre réponse assistant
 * puis son `result`, pour que `waitForTurnEnd` se débloque à chaque étape.
 */
function queryQuiRepondAChaqueTour() {
  let compteur = 0;
  const query = ({ prompt }: { prompt: unknown; options: Record<string, unknown> }) => {
    const generator = (async function* () {
      for await (const _ of prompt as AsyncIterable<unknown>) {
        compteur += 1;
        yield {
          type: 'assistant',
          message: { id: `msg_${compteur}`, content: [{ type: 'text', text: 'fait' }] },
          uuid: `m${compteur}`,
          session_id: 's1',
        };
        yield { type: 'result', subtype: 'success', total_cost_usd: 0.01, session_id: 's1', uuid: `r${compteur}` };
      }
    })();

    return Object.assign(generator, {
      interrupt: async () => undefined,
      setModel: async () => {},
      setPermissionMode: async () => {},
      applyFlagSettings: async () => {},
      supportedModels: async () => [],
      // Chaque 'result' déclenche `refreshContextUsage` cote manager : sans ce double, l'appel a
      // `getContextUsage` (absent) leve et produit un evenement `error` parasite a chaque tour.
      getContextUsage: async () => ({ totalTokens: 0, maxTokens: 0, percentage: 0, categories: [] }),
    });
  };

  return { query };
}

/**
 * Enveloppe `emit` pour construire `waitForTurnEnd()` sans toucher à `SessionManager` : broadcast
 * l'événement normalement, et résout les attentes en cours quand le statut repasse à `'idle'`.
 * Même motif que `server/index.ts` §2 du brief, dupliqué ici car non exporté par `createServer`.
 */
function creerAttenteDeTour(broadcast: (e: ServerEvent) => void) {
  let waiters: Array<() => void> = [];
  const emit = (event: ServerEvent) => {
    broadcast(event);
    if (event.type === 'session.state' && event.state.status === 'idle') {
      const toWake = waiters;
      waiters = [];
      for (const w of toWake) w();
    }
  };
  const waitForTurnEnd = () => new Promise<void>((resolve) => waiters.push(resolve));
  return { emit, waitForTurnEnd };
}

/**
 * Montage pour le test de couture du workflow : un vrai serveur, un vrai gestionnaire, un vrai
 * exécuteur de workflow construit exactement comme dans `server/index.ts`, un vrai socket, un vrai
 * `reduceEvent` côté client.
 */
async function monterCoutureWorkflow() {
  const { query } = queryQuiRepondAChaqueTour();

  let manager: ReturnType<typeof createSessionManager> | null = null;
  let executor: ReturnType<typeof createWorkflowExecutor> | null = null;

  const server = await createServer(0, {
    onConnect: (send) => {
      if (manager) send({ type: 'session.state', state: manager.state() });
    },
    onCommand: (cmd) => {
      if (!manager) return;
      if (cmd.type === 'message.send') manager.send(cmd.text);
      if (cmd.type === 'workflow.resume' && cmd.action === 'continue') {
        void executor?.continueAfterGate();
      }
      if (cmd.type === 'workflow.resume' && cmd.action === 'correct') {
        executor?.correctAtGate();
      }
    },
  });

  const { emit, waitForTurnEnd } = creerAttenteDeTour((e) => server.broadcast(e));

  manager = createSessionManager({
    cwd: process.cwd(),
    emit,
    queryFn: query as never,
  });

  executor = createWorkflowExecutor({
    applyRuntime: manager.applyRuntime,
    send: manager.send,
    waitForTurnEnd,
    emitCheckpoint: (checkpoint) => server.broadcast({ type: 'workflow.checkpoint', checkpoint }),
  });

  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
  let state: AppState = initialState;
  const recus: ServerEvent[] = [];
  socket.on('message', (raw) => {
    const event = JSON.parse(raw.toString()) as ServerEvent;
    recus.push(event);
    state = reduceEvent(state, event);
  });
  await new Promise((resolve) => socket.on('open', resolve));

  return {
    manager,
    executor,
    server,
    socket,
    recus,
    state: () => state,
    fermer: async () => {
      socket.close();
      await manager?.stop();
      await server.close();
    },
  };
}

function checkpointIds(state: AppState): string[] {
  return state.thread
    .filter((e): e is Extract<AppState['thread'][number], { kind: 'checkpoint' }> => e.kind === 'checkpoint')
    .map((e) => `${e.checkpoint.id}-${e.checkpoint.status}`);
}

test('un workflow traverse le systeme entier jusqu a la barriere puis reprend, sans double de protocole', async () => {
  const { executor, socket, recus, state, fermer } = await monterCoutureWorkflow();
  try {
  const workflow: WorkflowDefinition = {
    id: 'wf-couture',
    name: 'Workflow de couture',
    steps: [
      { id: 's1', label: 'Étape 1', prompt: 'fais 1', model: 'model-a', gate: false },
      { id: 's2', label: 'Étape 2', prompt: 'fais 2', model: 'model-b', gate: true },
      { id: 's3', label: 'Étape 3', prompt: 'fais 3', model: 'model-c', gate: false },
    ],
  };

  void executor.start(workflow);

  const deadline1 = Date.now() + 3000;
  while (Date.now() < deadline1 && checkpointIds(state()).length < 5) {
    await new Promise((r) => setTimeout(r, 20));
  }

  assert.deepEqual(checkpointIds(state()), [
    's1-running',
    's1-done',
    's2-running',
    's2-done',
    's2-gate',
  ]);

  const parEtat = (id: string, status: string) =>
    state().thread.find(
      (e) => e.kind === 'checkpoint' && e.checkpoint.id === id && e.checkpoint.status === status
    );
  const s1Done = parEtat('s1', 'done');
  assert.ok(s1Done && s1Done.kind === 'checkpoint' && s1Done.checkpoint.model === 'model-a');
  const s2Running = parEtat('s2', 'running');
  assert.ok(s2Running && s2Running.kind === 'checkpoint' && s2Running.checkpoint.model === 'model-b');

  // L'étape 3 n'a pas démarré : suspendu à la barrière, pas de checkpoint pour elle.
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(checkpointIds(state()).some((id) => id.startsWith('s3-')), false);

  const commande = { type: 'workflow.resume', checkpointId: 's2', action: 'continue' };
  assert.notEqual(parseClientCommand(JSON.stringify(commande)), null);
  socket.send(JSON.stringify(commande));

  const deadline2 = Date.now() + 3000;
  while (Date.now() < deadline2 && checkpointIds(state()).length < 7) {
    await new Promise((r) => setTimeout(r, 20));
  }

  assert.deepEqual(checkpointIds(state()), [
    's1-running',
    's1-done',
    's2-running',
    's2-done',
    's2-gate',
    's3-running',
    's3-done',
  ]);
  const s3Done = parEtat('s3', 'done');
  assert.ok(
    s3Done &&
      s3Done.kind === 'checkpoint' &&
      s3Done.checkpoint.model === 'model-c' &&
      s3Done.checkpoint.stepIndex === 2 &&
      s3Done.checkpoint.totalSteps === 3
  );

  assert.equal(recus.filter((e) => e.type === 'error').length, 0);
  } finally {
    await fermer();
  }
});

test('workflow.resume avec action correct suspend le workflow sans jamais lancer l etape suivante', async () => {
  const { executor, socket, state, fermer } = await monterCoutureWorkflow();
  try {
  const workflow: WorkflowDefinition = {
    id: 'wf-correct',
    name: 'Workflow barre des le debut',
    steps: [
      { id: 's1', label: 'Étape 1', prompt: 'fais 1', gate: true },
      { id: 's2', label: 'Étape 2', prompt: 'fais 2', gate: false },
    ],
  };

  void executor.start(workflow);

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && checkpointIds(state()).length < 3) {
    await new Promise((r) => setTimeout(r, 20));
  }

  assert.deepEqual(checkpointIds(state()), ['s1-running', 's1-done', 's1-gate']);

  socket.send(JSON.stringify({ type: 'workflow.resume', checkpointId: 's1', action: 'correct' }));

  await new Promise((r) => setTimeout(r, 200));

  assert.deepEqual(checkpointIds(state()), ['s1-running', 's1-done', 's1-gate']);
  assert.equal(checkpointIds(state()).some((id) => id.startsWith('s2-')), false);
  } finally {
    await fermer();
  }
});

/**
 * Couture tranche 3 : un fichier modifié hors de l'application (par un éditeur, pas par un outil
 * observé) doit mettre à jour le pied de page et la liste des fichiers — critère de fin, point 3.
 * Aucun SDK ici : `createGitWatcher` réel, `git` réel dans un dépôt jetable, `fs.watch` réel.
 */
test('un fichier modifie hors de l application traverse jusqu a l etat du pied de page', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cd-couture-git-'));
  const git = (...args: string[]) => execFileAsync('git', args, { cwd: dir });

  await git('init', '-q');
  await git('config', 'user.email', 'test@example.com');
  await git('config', 'user.name', 'Test');
  await writeFile(join(dir, 'a.ts'), 'un\ndeux\ntrois\n');
  await git('add', '.');
  await git('commit', '-q', '-m', 'initial');

  const server = await createServer(0);
  const gitWatcher = createGitWatcher({ cwd: dir, emit: (e) => server.broadcast(e) });

  let state: AppState = initialState;
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
  socket.on('message', (raw) => {
    state = reduceEvent(state, JSON.parse(raw.toString()) as ServerEvent);
  });
  await new Promise((resolve) => socket.on('open', resolve));

  // Modification "hors de l'application" : une écriture fs directe, jamais un outil observé par
  // le gestionnaire de session (qui n'existe même pas dans ce test).
  await writeFile(join(dir, 'a.ts'), 'un\ndeux\ntrois\nquatre\n');

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && state.changedFiles.length === 0) {
    await new Promise((r) => setTimeout(r, 100));
  }

  assert.equal(state.changedFiles.length, 1, 'le fichier modifie doit apparaitre sans double de protocole');
  assert.equal(state.changedFiles[0]?.path, 'a.ts');
  assert.equal(state.changedFiles[0]?.added, 1);
  assert.equal(state.changedFiles[0]?.removed, 0);
  assert.ok(state.git !== null && state.git.dirty >= 1, 'le pied de page doit refleter au moins un fichier modifie');

  gitWatcher.stop();
  socket.close();
  await server.close();
});

