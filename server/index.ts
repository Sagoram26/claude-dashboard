import { createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import { parseClientCommand, type ClientCommand, type ServerEvent, type WorkflowDefinition, type PromptDefinition } from './protocol.ts';
import type { RecentSession } from './session/recent.ts';

export type ServerHandlers = {
  onCommand?: (cmd: ClientCommand, send: (event: ServerEvent) => void) => void;
  onConnect?: (send: (event: ServerEvent) => void) => void;
  /** Peuple l'écran d'accueil (feature 06). Absent en test : /sessions rend alors une liste vide. */
  listSessions?: () => Promise<RecentSession[]>;
};

export async function createServer(
  port: number,
  handlers: ServerHandlers = {}
): Promise<{ close: () => Promise<void>; port: number; broadcast: (e: ServerEvent) => void }> {
  const http = createHttpServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.url === '/sessions') {
      void (handlers.listSessions?.() ?? Promise.resolve([])).then((sessions) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(sessions));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server: http, path: '/ws' });
  const clients = new Set<WebSocket>();

  const broadcast = (event: ServerEvent) => {
    const payload = JSON.stringify(event);
    for (const client of clients) {
      if (client.readyState === client.OPEN) client.send(payload);
    }
  };

  wss.on('connection', (socket) => {
    clients.add(socket);
    const send = (event: ServerEvent) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
    };

    handlers.onConnect?.(send);

    socket.on('message', (data) => {
      const cmd = parseClientCommand(data.toString());
      if (!cmd) return;
      handlers.onCommand?.(cmd, send);
    });

    socket.on('close', () => clients.delete(socket));
  });

  await new Promise<void>((resolve) => http.listen(port, '127.0.0.1', resolve));
  const bound = http.address() as AddressInfo;

  return {
    port: bound.port,
    broadcast,
    close: async () => {
      for (const client of clients) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve, reject) =>
        http.close((err) => (err ? reject(err) : resolve()))
      );
    },
  };
}

/**
 * Enveloppe `emit` pour construire `waitForTurnEnd()` sans toucher à la signature publique de
 * `SessionManager` (déjà testée par `manager.test.ts`) : broadcast l'événement normalement, et
 * résout les attentes en cours quand le statut repasse à `'idle'`. Motif classique (liste de
 * résolveurs vidée à chaque passage), utilitaire local, pas de module séparé pour si peu.
 *
 * Correctif round 1 de revue de la feature 06 : chaque attente est taguée par un jeton `owner`
 * propre à l'exécuteur qui l'a enregistrée (voir `workflow.start` plus bas). Au passage à
 * `'idle'`, seuls les résolveurs dont le jeton correspond encore au propriétaire courant
 * (`getActiveOwner()`) sont débloqués. Sans ce filtrage, un `workflow.start` qui remplace
 * `activeExecutor` pendant qu'un workflow tourne déjà laissait l'ancien exécuteur partager la
 * même closure `waiters`/`manager.send` que le nouveau : au prochain `'idle'`, l'ancien reprenait
 * sa propre séquence EN PARALLÈLE du nouveau, entrelaçant deux `manager.send()` dans la même
 * session et diffusant les checkpoints des deux workflows sans distinction. Ici, un exécuteur
 * remplacé reste bloqué indéfiniment sur son `waitForTurnEnd()` en cours — un abandon silencieux,
 * pas une annulation active de l'appel SDK — et son `emitCheckpoint` (ci-dessous) est lui aussi
 * gardé par le même jeton pour ne jamais diffuser les checkpoints d'un exécuteur abandonné.
 */
function creerAttenteDeTour(broadcast: (e: ServerEvent) => void, getActiveOwner: () => unknown) {
  let waiters: Array<{ resolve: () => void; owner: unknown }> = [];
  const emit = (event: ServerEvent) => {
    broadcast(event);
    if (event.type === 'session.state' && event.state.status === 'idle') {
      const toWake = waiters;
      waiters = [];
      const active = getActiveOwner();
      for (const w of toWake) {
        if (w.owner === active) w.resolve();
      }
    }
  };
  const waitForTurnEndFor = (owner: unknown) => () =>
    new Promise<void>((resolve) => waiters.push({ resolve, owner }));
  return { emit, waitForTurnEndFor };
}

const isEntrypoint = /[\\/]index\.(ts|js)$/.test(process.argv[1] ?? '');
if (isEntrypoint) {
  const { createSessionManager } = await import('./session/manager.ts');
  const { createPermissionStore } = await import('./session/permission-store.ts');
  const { createGitWatcher } = await import('./session/git-watcher.ts');
  const { listRecentSessions } = await import('./session/recent.ts');
  const { listWorkflows, loadWorkflow, saveWorkflow, deleteWorkflow } = await import('./workflows/store.ts');
  const { listPrompts, savePrompt, deletePrompt } = await import('./prompts/store.ts');
  const { createWorkflowExecutor } = await import('./workflows/executor.ts');
  const { homedir } = await import('node:os');
  const { join } = await import('node:path');

  let manager: ReturnType<typeof createSessionManager> | null = null;
  let gitWatcher: ReturnType<typeof createGitWatcher> | null = null;
  let activeExecutor: ReturnType<typeof createWorkflowExecutor> | null = null;
  // Jeton d'identité du workflow actif : distinct de `activeExecutor` pour que
  // `creerAttenteDeTour` (défini plus bas, avant que `manager`/`waitForTurnEndFor` existent) et
  // `emitCheckpoint` puissent tous deux filtrer sur la même valeur simplement comparable.
  let activeOwner: object | null = null;

  const workflowsDir = join(process.cwd(), '.claude-dashboard', 'workflows');
  const promptsDir = join(process.cwd(), '.claude-dashboard', 'prompts');
  let workflows: WorkflowDefinition[] = await listWorkflows(workflowsDir);
  let prompts: PromptDefinition[] = await listPrompts(promptsDir);

  const server = await createServer(Number(process.env.PORT ?? 4317), {
    listSessions: async () => {
      const sessions = await listRecentSessions(join(homedir(), '.claude', 'projects'));
      const currentId = manager?.state().sessionId;
      // Seule la session que ce serveur a réellement en mémoire peut restituer son contexte
      // (manager.history()) : les autres sont réelles mais lues à froid depuis un transcript.
      return sessions.map((s) => ({ ...s, resumable: currentId !== null && s.sessionId === currentId }));
    },
    onConnect: (send) => {
      if (!manager) return;
      send({ type: 'session.state', state: manager.state() });
      // Rejoue le fil complet avant les demandes en attente : reprendre une session (feature 06)
      // doit restituer le contexte de l'échange précédent, pas repartir d'une conversation vide.
      for (const event of manager.history()) send(event);
      for (const request of manager.pendingPermissions()) {
        send({ type: 'permission.request', request });
      }
      send({ type: 'permission.granted', granted: manager.grantedPermissions() });
      if (gitWatcher) {
        const snapshot = gitWatcher.state();
        send({ type: 'git.state', git: snapshot.git });
        send({ type: 'files.changed', files: snapshot.files });
      }
      send({ type: 'workflows.list', workflows });
      send({ type: 'prompts.list', prompts });
    },
    onCommand: (cmd) => {
      if (cmd.type === 'workflow.save') {
        void saveWorkflow(workflowsDir, cmd.workflow).then(async () => {
          workflows = await listWorkflows(workflowsDir);
          server.broadcast({ type: 'workflows.list', workflows });
        });
      }
      if (cmd.type === 'workflow.delete') {
        void deleteWorkflow(workflowsDir, cmd.id).then(async () => {
          workflows = await listWorkflows(workflowsDir);
          server.broadcast({ type: 'workflows.list', workflows });
        });
      }
      if (cmd.type === 'prompt.save') {
        void savePrompt(promptsDir, cmd.prompt).then(async () => {
          prompts = await listPrompts(promptsDir);
          server.broadcast({ type: 'prompts.list', prompts });
        });
      }
      if (cmd.type === 'prompt.delete') {
        void deletePrompt(promptsDir, cmd.id).then(async () => {
          prompts = await listPrompts(promptsDir);
          server.broadcast({ type: 'prompts.list', prompts });
        });
      }
      if (cmd.type === 'workflow.start') {
        if (!manager) return;
        void loadWorkflow(workflowsDir, cmd.workflowId).then((workflow) => {
          if (!workflow) {
            server.broadcast({ type: 'error', message: `Workflow introuvable : ${cmd.workflowId}` });
            return;
          }
          if (!manager) return;
          // Un seul workflow actif à la fois : un nouveau `workflow.start` reçu pendant qu'un
          // autre tourne remplace l'exécuteur précédent (décision documentée dans le rapport de
          // la feature 06 — pas de file d'attente, pas d'erreur, le plus simple des deux options).
          // Chaque exécuteur reçoit son PROPRE jeton `owner` (round 1 de revue) : `waitForTurnEnd`
          // et `emitCheckpoint` de l'ancien exécuteur ne réagissent plus jamais une fois remplacé.
          const owner = {};
          const nouvelExecuteur = createWorkflowExecutor({
            applyRuntime: manager.applyRuntime,
            send: manager.send,
            waitForTurnEnd: waitForTurnEndFor(owner),
            emitCheckpoint: (checkpoint) => {
              if (activeOwner === owner) server.broadcast({ type: 'workflow.checkpoint', checkpoint });
            },
          });
          activeExecutor = nouvelExecuteur;
          activeOwner = owner;
          void nouvelExecuteur.start(workflow);
        });
      }
      if (cmd.type === 'workflow.resume') {
        if (cmd.action === 'continue') void activeExecutor?.continueAfterGate();
        if (cmd.action === 'correct') activeExecutor?.correctAtGate();
      }
      if (!manager) return;
      if (cmd.type === 'message.send') manager.send(cmd.text);
      if (cmd.type === 'session.interrupt') {
        // Filet de sécurité : manager.interrupt() gère déjà l'échec en interne (voir manager.ts),
        // mais un rejet non capturé ici ferait tomber le processus par défaut.
        manager.interrupt().catch((err: unknown) => {
          server.broadcast({ type: 'error', message: err instanceof Error ? err.message : String(err) });
        });
      }
      if (cmd.type === 'permission.respond') {
        manager.respondPermission(cmd.requestId, cmd.decision, cmd.reason);
      }
      if (cmd.type === 'permission.revoke') {
        manager.revokePermission(cmd.toolName).catch((err: unknown) => {
          server.broadcast({ type: 'error', message: err instanceof Error ? err.message : String(err) });
        });
      }
      if (cmd.type === 'context.compact') {
        manager.compact();
      }
      if (cmd.type === 'context.request-full') {
        manager.requestContextDetail();
      }
      if (cmd.type === 'runtime.set') {
        // applyRuntime ne rejette jamais — elle capture et émet une erreur ; `void` est donc sûr,
        // contrairement à `void manager.interrupt()` qui avait fait tomber le serveur en tranche 1.
        void manager.applyRuntime({
          model: cmd.model,
          effort: cmd.effort,
          permissionMode: cmd.permissionMode,
        });
      }
    },
  });

  const store = await createPermissionStore(process.cwd());
  const { emit, waitForTurnEndFor } = creerAttenteDeTour((event) => server.broadcast(event), () => activeOwner);

  manager = createSessionManager({
    cwd: process.cwd(),
    emit,
    store,
  });

  gitWatcher = createGitWatcher({
    cwd: process.cwd(),
    emit: (event) => server.broadcast(event),
  });

  console.log(`server listening on http://127.0.0.1:${server.port}`);
}
