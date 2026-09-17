# Feature 05 — Conversation et streaming

Objectif : la colonne de conversation, le composeur, et le texte de l'agent qui s'écrit au fil des événements serveur.

Cette feature relie le client au serveur pour la première fois. Elle verrouille aussi la première loi de la mise en page côté client : un `tool.activity` reçu ne doit produire aucun rendu dans la conversation.

**Files:**
- Create: `client/src/socket.ts`
- Create: `client/src/socket.test.ts`
- Create: `client/src/state.ts`
- Create: `client/src/state.test.ts`
- Create: `client/src/components/Conversation.tsx`
- Create: `client/src/components/Composer.tsx`
- Modify: `client/src/screens/Session.tsx`
- Modify: `client/src/screens/Session.test.tsx`

**Interfaces:**
- Consomme : `ServerEvent`, `ClientCommand` de `server/protocol.ts`, importés directement par le client.
- Produit :
  - `connect(url: string, onEvent: (e: ServerEvent) => void): { send(cmd: ClientCommand): void; close(): void }`
  - `type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string; streaming: boolean }`
  - `reduceEvent(state: AppState, event: ServerEvent): AppState`
  - `type AppState = { messages: ChatMessage[]; status: SessionState['status']; toolActivityCount: number }`
  - `<Conversation messages={ChatMessage[]} />`
  - `<Composer onSend={(text: string) => void} disabled={boolean} />`

---

## Partie A — Le réducteur d'état

- [ ] **Step 1: Écrire le test du réducteur qui échoue**

Créer `client/src/state.test.ts` :

```ts
import { test, expect } from 'vitest';
import { initialState, reduceEvent } from './state.ts';

test('un delta crée un message en cours de streaming', () => {
  const state = reduceEvent(initialState, {
    type: 'message.delta',
    messageId: 'm1',
    text: 'bon',
  });

  expect(state.messages).toEqual([
    { id: 'm1', role: 'assistant', text: 'bon', streaming: true },
  ]);
});

test('les deltas successifs s accumulent sur le même message', () => {
  let state = reduceEvent(initialState, { type: 'message.delta', messageId: 'm1', text: 'bon' });
  state = reduceEvent(state, { type: 'message.delta', messageId: 'm1', text: 'jour' });

  expect(state.messages).toHaveLength(1);
  expect(state.messages[0]?.text).toBe('bonjour');
});

test('message.complete fige le texte et arrête le streaming', () => {
  let state = reduceEvent(initialState, { type: 'message.delta', messageId: 'm1', text: 'bon' });
  state = reduceEvent(state, {
    type: 'message.complete',
    messageId: 'm1',
    role: 'assistant',
    text: 'bonjour',
  });

  expect(state.messages[0]).toEqual({
    id: 'm1',
    role: 'assistant',
    text: 'bonjour',
    streaming: false,
  });
});

test('un appel d outil ne crée aucun message', () => {
  const state = reduceEvent(initialState, {
    type: 'tool.activity',
    toolUseId: 't1',
    name: 'Bash',
    target: 'ls',
  });

  expect(state.messages).toEqual([]);
  expect(state.toolActivityCount).toBe(1);
});
```

Le dernier test est la garantie côté client de la première loi. Il doit rester vert pour toujours.

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm run test:client`
Expected: FAIL — `Cannot find module './state.ts'`

- [ ] **Step 3: Implémenter le réducteur**

Créer `client/src/state.ts` :

```ts
import type { ServerEvent, SessionState } from '../../server/protocol.ts';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  streaming: boolean;
};

export type AppState = {
  messages: ChatMessage[];
  status: SessionState['status'];
  toolActivityCount: number;
};

export const initialState: AppState = {
  messages: [],
  status: 'idle',
  toolActivityCount: 0,
};

export function reduceEvent(state: AppState, event: ServerEvent): AppState {
  switch (event.type) {
    case 'message.delta': {
      const index = state.messages.findIndex((m) => m.id === event.messageId);
      if (index === -1) {
        return {
          ...state,
          messages: [
            ...state.messages,
            { id: event.messageId, role: 'assistant', text: event.text, streaming: true },
          ],
        };
      }
      const messages = [...state.messages];
      const existing = messages[index];
      if (!existing) return state;
      messages[index] = { ...existing, text: existing.text + event.text };
      return { ...state, messages };
    }

    case 'message.complete': {
      const index = state.messages.findIndex((m) => m.id === event.messageId);
      const settled: ChatMessage = {
        id: event.messageId,
        role: event.role,
        text: event.text,
        streaming: false,
      };
      if (index === -1) return { ...state, messages: [...state.messages, settled] };
      const messages = [...state.messages];
      messages[index] = settled;
      return { ...state, messages };
    }

    case 'tool.activity':
      return { ...state, toolActivityCount: state.toolActivityCount + 1 };

    case 'session.state':
      return { ...state, status: event.state.status };

    default:
      return state;
  }
}
```

Le `default` ignore tout le reste : les événements des tranches 2 à 4 traverseront sans casser.

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npm run test:client`
Expected: PASS — 4 tests de réducteur verts

## Partie B — Le client WebSocket

- [ ] **Step 5: Écrire le test du client socket qui échoue**

Créer `client/src/socket.test.ts` :

```ts
import { test, expect, vi } from 'vitest';
import { connect } from './socket.ts';
import type { ServerEvent } from '../../server/protocol.ts';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  sent: string[] = [];
  readyState = 1;
  onmessage: ((e: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(payload: string) { this.sent.push(payload); }
  close() { this.readyState = 3; }
}

test('transmet les événements reçus au callback', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);
  const seen: ServerEvent[] = [];

  connect('ws://test/ws', (event) => seen.push(event));
  const socket = FakeWebSocket.instances.at(-1);
  socket?.onmessage?.({ data: JSON.stringify({ type: 'cost.usage', totalUsd: 1.5 }) });

  expect(seen).toEqual([{ type: 'cost.usage', totalUsd: 1.5 }]);
});

test('sérialise les commandes envoyées', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);
  const conn = connect('ws://test/ws', () => {});
  conn.send({ type: 'message.send', text: 'salut' });

  const socket = FakeWebSocket.instances.at(-1);
  expect(socket?.sent).toEqual([JSON.stringify({ type: 'message.send', text: 'salut' })]);
});

test('ignore un message serveur illisible', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);
  const seen: ServerEvent[] = [];

  connect('ws://test/ws', (event) => seen.push(event));
  const socket = FakeWebSocket.instances.at(-1);
  socket?.onmessage?.({ data: 'pas du json' });

  expect(seen).toEqual([]);
});
```

- [ ] **Step 6: Lancer le test pour vérifier qu'il échoue**

Run: `npm run test:client`
Expected: FAIL — `Cannot find module './socket.ts'`

- [ ] **Step 7: Implémenter le client socket**

Créer `client/src/socket.ts` :

```ts
import type { ClientCommand, ServerEvent } from '../../server/protocol.ts';

export type Connection = {
  send(command: ClientCommand): void;
  close(): void;
};

export function connect(url: string, onEvent: (event: ServerEvent) => void): Connection {
  const socket = new WebSocket(url);

  socket.onmessage = (message: { data: unknown }) => {
    if (typeof message.data !== 'string') return;
    try {
      onEvent(JSON.parse(message.data) as ServerEvent);
    } catch {
      // message serveur illisible : on ignore plutôt que de casser l'interface
    }
  };

  return {
    send(command) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(command));
    },
    close() {
      socket.close();
    },
  };
}
```

- [ ] **Step 8: Lancer le test pour vérifier qu'il passe**

Run: `npm run test:client`
Expected: PASS — 3 tests de socket verts

## Partie C — Les composants

- [ ] **Step 9: Écrire la conversation**

Créer `client/src/components/Conversation.tsx` :

```tsx
import type { ChatMessage } from '../state.ts';

export function Conversation({ messages }: { messages: ChatMessage[] }) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '16px 0',
      }}
    >
      {messages.map((message) => (
        <article
          key={message.id}
          data-role={message.role}
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: message.role === 'user' ? 'var(--text-muted)' : 'var(--text)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {message.text}
        </article>
      ))}
    </div>
  );
}
```

Aucune animation par token : le design system l'interdit explicitement. Le texte apparaît parce que l'état change, rien de plus.

- [ ] **Step 10: Écrire le composeur**

Créer `client/src/components/Composer.tsx` :

```tsx
import { useState } from 'react';

export function Composer({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
}) {
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <div style={{ flex: '0 0 auto', paddingBottom: 16 }}>
      <textarea
        aria-label="Message"
        value={text}
        disabled={disabled}
        rows={3}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        style={{
          width: '100%',
          resize: 'none',
          background: 'var(--surface-raised)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-control)',
          padding: 8,
          font: 'inherit',
        }}
        placeholder="Écrire un message…"
      />
    </div>
  );
}
```

- [ ] **Step 11: Écrire le test d'intégration de l'écran qui échoue**

Ajouter à `client/src/screens/Session.test.tsx` :

```tsx
import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Session } from './Session.tsx';

test('un message reçu apparaît dans la conversation', async () => {
  const listeners: ((e: { data: string }) => void)[] = [];

  class FakeWebSocket {
    readyState = 1;
    sent: string[] = [];
    set onmessage(fn: (e: { data: string }) => void) { listeners.push(fn); }
    send(payload: string) { this.sent.push(payload); }
    close() {}
  }
  vi.stubGlobal('WebSocket', FakeWebSocket);

  render(<Session />);

  listeners[0]?.({
    data: JSON.stringify({
      type: 'message.complete',
      messageId: 'm1',
      role: 'assistant',
      text: 'bonjour',
    }),
  });

  expect(await screen.findByText('bonjour')).toBeDefined();
});

test('un appel d outil ne rend rien dans la conversation', () => {
  const listeners: ((e: { data: string }) => void)[] = [];

  class FakeWebSocket {
    readyState = 1;
    set onmessage(fn: (e: { data: string }) => void) { listeners.push(fn); }
    send() {}
    close() {}
  }
  vi.stubGlobal('WebSocket', FakeWebSocket);

  render(<Session />);

  listeners[0]?.({
    data: JSON.stringify({ type: 'tool.activity', toolUseId: 't1', name: 'Bash', target: 'ls' }),
  });

  expect(screen.getByRole('main').textContent).not.toContain('Bash');
  expect(screen.getByRole('main').textContent).not.toContain('ls');
});
```

- [ ] **Step 12: Lancer le test pour vérifier qu'il échoue**

Run: `npm run test:client`
Expected: FAIL — `Session` ne se connecte à rien

- [ ] **Step 13: Câbler l'écran Session**

Réécrire le corps de `client/src/screens/Session.tsx` en gardant `PLACEHOLDER_CONTROLS` et `PLACEHOLDER_FOOTER` :

```tsx
import { useEffect, useReducer, useRef } from 'react';
import { TopBar, type ControlPill } from '../components/TopBar.tsx';
import { Footer, type FooterItem } from '../components/Footer.tsx';
import { Conversation } from '../components/Conversation.tsx';
import { Composer } from '../components/Composer.tsx';
import { connect, type Connection } from '../socket.ts';
import { initialState, reduceEvent } from '../state.ts';

const SOCKET_URL = `ws://${location.host}/ws`;

export function Session() {
  const [state, dispatch] = useReducer(reduceEvent, initialState);
  const connection = useRef<Connection | null>(null);

  useEffect(() => {
    const conn = connect(SOCKET_URL, dispatch);
    connection.current = conn;
    return () => conn.close();
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar controls={PLACEHOLDER_CONTROLS} />
      <main role="main" style={{ flex: 1, minHeight: 0, display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            width: '100%',
            maxWidth: 'var(--conversation-max)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <Conversation messages={state.messages} />
          <Composer
            disabled={state.status === 'disconnected'}
            onSend={(text) => connection.current?.send({ type: 'message.send', text })}
          />
        </div>
      </main>
      <Footer items={PLACEHOLDER_FOOTER} />
    </div>
  );
}
```

`reduceEvent` a exactement la signature `(state, action) => state` attendue par `useReducer` : il se passe directement, sans adaptateur.

- [ ] **Step 14: Lancer tous les tests client**

Run: `npm run test:client`
Expected: PASS — réducteur, socket et écran verts

- [ ] **Step 15: Vérification manuelle de bout en bout**

Run: serveur et client démarrés, ouvrir `http://127.0.0.1:5317`.
Expected: taper « liste les fichiers de ce dossier » puis Entrée fait apparaître la réponse. Taper un second message aboutit dans la même session. Aucun nom d'outil n'apparaît dans la colonne.

- [ ] **Step 16: Commit**

```bash
git add client/src/socket.ts client/src/socket.test.ts client/src/state.ts client/src/state.test.ts client/src/components/Conversation.tsx client/src/components/Composer.tsx client/src/screens/Session.tsx client/src/screens/Session.test.tsx
git commit -m "feat: conversation reliée au serveur, streaming et composeur"
```
