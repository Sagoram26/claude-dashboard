# Feature 03 — Session manager

Objectif : ouvrir une session Claude Code qui reste vivante entre les tours, y pousser des messages, et diffuser ce qui en sort.

C'est la feature qui justifie tout le choix technique. `claude -p` en mode headless est un aller-retour par invocation ; le SDK accepte un `AsyncIterable<SDKUserMessage>` en `prompt`, ce qui ouvre le flux une fois et permet d'y pousser au fil de l'eau.

**Le piège à traiter en premier** : si l'itérable se termine après le premier message, la session se ferme au premier `result`. L'itérable doit rester en attente indéfiniment jusqu'à ce qu'on pousse le message suivant. Le test qui compte est celui de deux messages successifs dans la même session.

**Files:**
- Create: `server/session/queue.ts`
- Create: `server/session/queue.test.ts`
- Create: `server/session/manager.ts`
- Create: `server/session/manager.test.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Consomme : `ServerEvent`, `ClientCommand` de `server/protocol.ts`.
- Produit :
  - `createMessageQueue<T>(): { push(item: T): void; close(): void; stream: AsyncIterable<T> }`
  - `createSessionManager(opts: SessionManagerOptions): SessionManager`
  - `type SessionManager = { send(text: string): void; interrupt(): Promise<void>; state(): SessionState; stop(): Promise<void> }`
  - `type SessionManagerOptions = { cwd: string; emit: (e: ServerEvent) => void; queryFn?: QueryFn }`
  - `type QueryFn = typeof import('@anthropic-ai/claude-agent-sdk').query`

`queryFn` est injectable pour que les tests n'appellent jamais le réseau et ne consomment aucun crédit.

---

## Partie A — La file de messages

- [ ] **Step 1: Écrire le test de la file qui échoue**

Créer `server/session/queue.test.ts` :

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMessageQueue } from './queue.ts';

test('livre un élément poussé avant la lecture', async () => {
  const q = createMessageQueue<string>();
  q.push('a');

  const it = q.stream[Symbol.asyncIterator]();
  assert.deepEqual(await it.next(), { value: 'a', done: false });
});

test('attend un élément poussé après le début de la lecture', async () => {
  const q = createMessageQueue<string>();
  const it = q.stream[Symbol.asyncIterator]();

  const pending = it.next();
  q.push('b');

  assert.deepEqual(await pending, { value: 'b', done: false });
});

test('reste ouverte entre deux éléments', async () => {
  const q = createMessageQueue<string>();
  const it = q.stream[Symbol.asyncIterator]();

  q.push('un');
  assert.equal((await it.next()).value, 'un');

  const pending = it.next();
  q.push('deux');
  assert.equal((await pending).value, 'deux');
});

test('se termine sur close', async () => {
  const q = createMessageQueue<string>();
  const it = q.stream[Symbol.asyncIterator]();

  const pending = it.next();
  q.close();

  assert.equal((await pending).done, true);
});
```

Le troisième test est celui qui compte : c'est lui qui prouve que la session ne se referme pas après un tour.

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm test`
Expected: FAIL — `Cannot find module './queue.ts'`

- [ ] **Step 3: Implémenter la file**

Créer `server/session/queue.ts` :

```ts
export type MessageQueue<T> = {
  push(item: T): void;
  close(): void;
  stream: AsyncIterable<T>;
};

export function createMessageQueue<T>(): MessageQueue<T> {
  const buffer: T[] = [];
  let waiting: ((result: IteratorResult<T>) => void) | null = null;
  let closed = false;

  const push = (item: T) => {
    if (closed) return;
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve({ value: item, done: false });
      return;
    }
    buffer.push(item);
  };

  const close = () => {
    if (closed) return;
    closed = true;
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve({ value: undefined as never, done: true });
    }
  };

  const stream: AsyncIterable<T> = {
    [Symbol.asyncIterator]: () => ({
      next: (): Promise<IteratorResult<T>> => {
        const queued = buffer.shift();
        if (queued !== undefined) return Promise.resolve({ value: queued, done: false });
        if (closed) return Promise.resolve({ value: undefined as never, done: true });
        return new Promise((resolve) => {
          waiting = resolve;
        });
      },
    }),
  };

  return { push, close, stream };
}
```

Un seul lecteur est supporté, et c'est suffisant : le SDK est le seul consommateur.

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npm test`
Expected: PASS — 4 tests de file verts

- [ ] **Step 5: Commit**

```bash
git add server/session/queue.ts server/session/queue.test.ts
git commit -m "feat: file de messages asynchrone qui reste ouverte entre les tours"
```

## Partie B — Le gestionnaire de session

- [ ] **Step 6: Écrire le test du gestionnaire qui échoue**

Créer `server/session/manager.test.ts` :

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionManager } from './manager.ts';
import type { ServerEvent } from '../protocol.ts';

function fakeQuery(scenario: (userTexts: string[]) => unknown[]) {
  const userTexts: string[] = [];

  const query = ({ prompt }: { prompt: unknown }) => {
    const iterable = prompt as AsyncIterable<{ message: { content: unknown } }>;

    return (async function* () {
      for await (const userMessage of iterable) {
        const content = userMessage.message.content;
        userTexts.push(typeof content === 'string' ? content : JSON.stringify(content));
        for (const event of scenario(userTexts)) yield event;
      }
    })();
  };

  return { query: query as never, userTexts };
}

test('un message envoyé atteint le SDK et sa réponse est diffusée', async () => {
  const events: ServerEvent[] = [];
  const { query, userTexts } = fakeQuery(() => [
    {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'bonjour' }] },
      uuid: 'm1',
      session_id: 's1',
    },
    { type: 'result', subtype: 'success', total_cost_usd: 0.01, session_id: 's1', uuid: 'r1' },
  ]);

  const manager = createSessionManager({ cwd: '/tmp', emit: (e) => events.push(e), queryFn: query });
  manager.send('salut');
  await new Promise((r) => setTimeout(r, 20));

  assert.deepEqual(userTexts, ['salut']);
  const complete = events.find((e) => e.type === 'message.complete');
  assert.ok(complete && complete.type === 'message.complete');
  assert.equal(complete.text, 'bonjour');

  await manager.stop();
});

test('deux messages successifs restent dans la même session', async () => {
  const events: ServerEvent[] = [];
  const { query, userTexts } = fakeQuery((texts) => [
    {
      type: 'assistant',
      message: { content: [{ type: 'text', text: `reponse ${texts.length}` }] },
      uuid: `m${texts.length}`,
      session_id: 's1',
    },
    { type: 'result', subtype: 'success', total_cost_usd: 0.01, session_id: 's1', uuid: `r${texts.length}` },
  ]);

  const manager = createSessionManager({ cwd: '/tmp', emit: (e) => events.push(e), queryFn: query });

  manager.send('premier');
  await new Promise((r) => setTimeout(r, 20));
  manager.send('second');
  await new Promise((r) => setTimeout(r, 20));

  assert.deepEqual(userTexts, ['premier', 'second']);
  const completes = events.filter((e) => e.type === 'message.complete');
  assert.equal(completes.length, 2);

  await manager.stop();
});

test('les appels d outils ne produisent jamais de message de conversation', async () => {
  const events: ServerEvent[] = [];
  const { query } = fakeQuery(() => [
    {
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } },
          { type: 'text', text: 'voila' },
        ],
      },
      uuid: 'm1',
      session_id: 's1',
    },
    { type: 'result', subtype: 'success', total_cost_usd: 0.01, session_id: 's1', uuid: 'r1' },
  ]);

  const manager = createSessionManager({ cwd: '/tmp', emit: (e) => events.push(e), queryFn: query });
  manager.send('fais quelque chose');
  await new Promise((r) => setTimeout(r, 20));

  const complete = events.find((e) => e.type === 'message.complete');
  assert.ok(complete && complete.type === 'message.complete');
  assert.equal(complete.text, 'voila');

  const activity = events.filter((e) => e.type === 'tool.activity');
  assert.equal(activity.length, 1);

  await manager.stop();
});
```

Le troisième test verrouille la première loi de la mise en page : un `tool_use` produit un `tool.activity`, jamais un `message.complete`.

- [ ] **Step 7: Lancer le test pour vérifier qu'il échoue**

Run: `npm test`
Expected: FAIL — `Cannot find module './manager.ts'`

- [ ] **Step 8: Implémenter le gestionnaire**

Créer `server/session/manager.ts` :

```ts
import { query as realQuery } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { createMessageQueue } from './queue.ts';
import type { ServerEvent, SessionState } from '../protocol.ts';

export type QueryFn = typeof realQuery;

export type SessionManagerOptions = {
  cwd: string;
  emit: (event: ServerEvent) => void;
  queryFn?: QueryFn;
};

export type SessionManager = {
  send(text: string): void;
  interrupt(): Promise<void>;
  state(): SessionState;
  stop(): Promise<void>;
};

export function createSessionManager(opts: SessionManagerOptions): SessionManager {
  const queryFn = opts.queryFn ?? realQuery;
  const queue = createMessageQueue<SDKUserMessage>();

  let state: SessionState = {
    sessionId: null,
    cwd: opts.cwd,
    status: 'idle',
    model: null,
    permissionMode: null,
  };

  const setState = (patch: Partial<SessionState>) => {
    state = { ...state, ...patch };
    opts.emit({ type: 'session.state', state });
  };

  const session = queryFn({
    prompt: queue.stream,
    options: { cwd: opts.cwd },
  });

  const pump = (async () => {
    for await (const message of session as AsyncIterable<SDKMessage>) {
      handleMessage(message);
    }
  })().catch((err: unknown) => {
    opts.emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    setState({ status: 'disconnected' });
  });

  function handleMessage(message: SDKMessage): void {
    if (message.type === 'system') {
      setState({ sessionId: message.session_id, model: message.model ?? null });
      return;
    }

    if (message.type === 'assistant') {
      const blocks = message.message.content;
      if (!Array.isArray(blocks)) return;

      const texts: string[] = [];
      for (const block of blocks) {
        if (block.type === 'text') {
          texts.push(block.text);
        } else if (block.type === 'tool_use') {
          opts.emit({
            type: 'tool.activity',
            toolUseId: block.id,
            name: block.name,
            target: describeTarget(block.input),
          });
        }
      }

      if (texts.length > 0) {
        opts.emit({
          type: 'message.complete',
          messageId: message.uuid,
          role: 'assistant',
          text: texts.join('\n'),
        });
      }
      return;
    }

    if (message.type === 'result') {
      setState({ status: 'idle', sessionId: message.session_id });
      if ('total_cost_usd' in message) {
        opts.emit({ type: 'cost.usage', totalUsd: message.total_cost_usd });
      }
    }
  }

  function describeTarget(input: unknown): string | undefined {
    if (typeof input !== 'object' || input === null) return undefined;
    const record = input as Record<string, unknown>;
    for (const key of ['file_path', 'path', 'command', 'pattern']) {
      const value = record[key];
      if (typeof value === 'string') return value;
    }
    return undefined;
  }

  return {
    send(text: string) {
      setState({ status: 'generating' });
      queue.push({
        type: 'user',
        message: { role: 'user', content: text },
        parent_tool_use_id: null,
        session_id: state.sessionId ?? '',
      } as SDKUserMessage);
    },

    async interrupt() {
      await session.interrupt();
      setState({ status: 'idle' });
    },

    state: () => state,

    async stop() {
      queue.close();
      await pump;
    },
  };
}
```

Le `cost.usage` est émis dès maintenant parce qu'il vient gratuitement avec le `result` ; le pied de page le consommera en tranche 3.

- [ ] **Step 9: Lancer le test pour vérifier qu'il passe**

Run: `npm test`
Expected: PASS — 3 tests de gestionnaire verts

- [ ] **Step 10: Brancher le gestionnaire sur le serveur**

Dans `server/index.ts`, remplacer le bloc `isEntrypoint` :

```ts
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
```

- [ ] **Step 11: Vérifier le typage et lancer tous les tests**

Run: `npm run typecheck && npm test`
Expected: aucune erreur, tous les tests verts

- [ ] **Step 12: Vérification manuelle contre le vrai SDK**

Run: `node --experimental-strip-types server/index.ts`, puis depuis un autre terminal :

```bash
npx wscat -c ws://127.0.0.1:4317/ws
> {"type":"message.send","text":"dis bonjour en un mot"}
```

Expected: un événement `session.state`, puis un `message.complete` contenant la réponse, puis un `cost.usage`.

Si `wscat` n'est pas installé, cette vérification peut attendre la feature 05 qui donne une vraie interface.

- [ ] **Step 13: Commit**

```bash
git add server/session/manager.ts server/session/manager.test.ts server/index.ts
git commit -m "feat: gestionnaire de session multi-tours branché sur le SDK"
```
