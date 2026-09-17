import { createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import { parseClientCommand, type ClientCommand, type ServerEvent } from './protocol.ts';

export type ServerHandlers = {
  onCommand?: (cmd: ClientCommand, send: (event: ServerEvent) => void) => void;
  onConnect?: (send: (event: ServerEvent) => void) => void;
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

const isEntrypoint = process.argv[1]?.endsWith('index.ts');
if (isEntrypoint) {
  const { createSessionManager } = await import('./session/manager.ts');

  let manager: ReturnType<typeof createSessionManager> | null = null;

  const server = await createServer(4317, {
    onConnect: (send) => {
      if (manager) send({ type: 'session.state', state: manager.state() });
    },
    onCommand: (cmd) => {
      if (!manager) return;
      if (cmd.type === 'message.send') manager.send(cmd.text);
      if (cmd.type === 'session.interrupt') void manager.interrupt();
    },
  });

  manager = createSessionManager({
    cwd: process.cwd(),
    emit: (event) => server.broadcast(event),
  });

  console.log(`server listening on http://127.0.0.1:${server.port}`);
}
