import { createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import { parseClientCommand, type ClientCommand, type ServerEvent } from './protocol.ts';
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

const isEntrypoint = /[\\/]index\.(ts|js)$/.test(process.argv[1] ?? '');
if (isEntrypoint) {
  const { createSessionManager } = await import('./session/manager.ts');
  const { createPermissionStore } = await import('./session/permission-store.ts');
  const { createGitWatcher } = await import('./session/git-watcher.ts');
  const { listRecentSessions } = await import('./session/recent.ts');
  const { homedir } = await import('node:os');
  const { join } = await import('node:path');

  let manager: ReturnType<typeof createSessionManager> | null = null;
  let gitWatcher: ReturnType<typeof createGitWatcher> | null = null;

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
    },
    onCommand: (cmd) => {
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

  manager = createSessionManager({
    cwd: process.cwd(),
    emit: (event) => server.broadcast(event),
    store,
  });

  gitWatcher = createGitWatcher({
    cwd: process.cwd(),
    emit: (event) => server.broadcast(event),
  });

  console.log(`server listening on http://127.0.0.1:${server.port}`);
}
