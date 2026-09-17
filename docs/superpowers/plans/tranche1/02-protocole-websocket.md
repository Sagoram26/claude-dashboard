# Feature 02 — Protocole WebSocket

Objectif : figer le contrat serveur/client dans un seul fichier typé, et faire transiter un aller-retour sur une vraie connexion WebSocket.

Le principe du spec d'architecture : **le serveur pousse de l'état, le client pousse des intentions.** Le client ne calcule jamais un état qu'il pourrait recevoir.

Les unions sont déclarées en entier dès maintenant, y compris les membres que les tranches 2 à 4 câbleront. Figer le contrat tôt évite les renommages en cascade plus tard.

**Files:**
- Create: `server/protocol.ts`
- Create: `server/protocol.test.ts`
- Modify: `server/index.ts`
- Test: `server/socket.test.ts`

**Interfaces:**
- Consomme : `createServer(port)` de la feature 01.
- Produit :
  - `type ServerEvent` et `type ClientCommand`, unions discriminées sur `type`.
  - `parseClientCommand(raw: string): ClientCommand | null` — rend `null` sur entrée invalide, ne lève jamais.
  - `createServer(port, handlers?)` accepte désormais un second paramètre : `{ onCommand?: (cmd: ClientCommand, send: (e: ServerEvent) => void) => void }`.

---

- [ ] **Step 1: Écrire le test du protocole qui échoue**

Créer `server/protocol.test.ts` :

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClientCommand } from './protocol.ts';

test('parse une commande valide', () => {
  const cmd = parseClientCommand(JSON.stringify({ type: 'message.send', text: 'salut' }));
  assert.deepEqual(cmd, { type: 'message.send', text: 'salut' });
});

test('rejette un JSON invalide sans lever', () => {
  assert.equal(parseClientCommand('{pas du json'), null);
});

test('rejette un type inconnu', () => {
  assert.equal(parseClientCommand(JSON.stringify({ type: 'message.explode' })), null);
});

test('rejette une commande au bon type mais mal formée', () => {
  assert.equal(parseClientCommand(JSON.stringify({ type: 'message.send' })), null);
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm test`
Expected: FAIL — `Cannot find module './protocol.ts'`

- [ ] **Step 3: Écrire le protocole**

Créer `server/protocol.ts` :

```ts
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
```

La validation reste une table de prédicats plutôt qu'un schéma : sept commandes ne justifient pas une dépendance de validation.

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npm test`
Expected: PASS — 4 tests du protocole verts

- [ ] **Step 5: Écrire le test de l'aller-retour WebSocket qui échoue**

Créer `server/socket.test.ts` :

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createServer } from './index.ts';
import type { ServerEvent } from './protocol.ts';

test('une commande envoyée revient traitée par le handler', async () => {
  const seen: string[] = [];

  const server = await createServer(0, {
    onCommand: (cmd, send) => {
      seen.push(cmd.type);
      send({ type: 'cost.usage', totalUsd: 0.42 });
    },
  });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    await new Promise((resolve) => ws.once('open', resolve));

    const received = new Promise<ServerEvent>((resolve) => {
      ws.once('message', (data) => resolve(JSON.parse(data.toString())));
    });

    ws.send(JSON.stringify({ type: 'message.send', text: 'salut' }));
    const event = await received;

    assert.deepEqual(seen, ['message.send']);
    assert.deepEqual(event, { type: 'cost.usage', totalUsd: 0.42 });
    ws.close();
  } finally {
    await server.close();
  }
});

test('une commande invalide ne fait pas tomber le serveur', async () => {
  const seen: string[] = [];
  const server = await createServer(0, { onCommand: (cmd) => seen.push(cmd.type) });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    await new Promise((resolve) => ws.once('open', resolve));

    ws.send('{pas du json');
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.deepEqual(seen, []);
    assert.equal(ws.readyState, WebSocket.OPEN);
    ws.close();
  } finally {
    await server.close();
  }
});
```

- [ ] **Step 6: Lancer le test pour vérifier qu'il échoue**

Run: `npm test`
Expected: FAIL — `createServer` n'accepte pas de second argument, et rien n'écoute sur `/ws`

- [ ] **Step 7: Brancher le WebSocket sur le serveur**

Réécrire `server/index.ts` :

```ts
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
  const server = await createServer(4317);
  console.log(`server listening on http://127.0.0.1:${server.port}`);
}
```

Une commande invalide est ignorée silencieusement : c'est un client cassé, pas une raison de tuer la connexion.

- [ ] **Step 8: Lancer tous les tests**

Run: `npm test`
Expected: PASS — test de fumée, 4 tests de protocole, 2 tests de socket

- [ ] **Step 9: Vérifier le typage**

Run: `npm run typecheck`
Expected: aucune erreur

- [ ] **Step 10: Commit**

```bash
git add server/protocol.ts server/protocol.test.ts server/index.ts server/socket.test.ts
git commit -m "feat: protocole websocket typé et partagé"
```
