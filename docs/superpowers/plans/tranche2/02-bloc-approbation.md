# Feature 02 — Le bloc d'approbation dans le fil

Objectif : la demande de permission apparaît à sa place chronologique dans la conversation, avec le contenu exact soumis à approbation, et ses trois actions.

Le bloc **reste après la décision**, avec la décision prise. C'est ce qui donne l'historique gratuit de ce qui a été autorisé et quand (`docs/ui-spec.md`, section 2.5).

C'est la seule chose autre qu'un message et un checkpoint qui ait le droit de vivre dans le fil. La première loi de mise en page (`CLAUDE.md`) le nomme explicitement, et elle interdit tout aussi explicitement l'appel d'outil : un bloc d'approbation n'est pas un appel d'outil, c'est une question posée à l'utilisateur.

Signatures : [`docs/environnement.md`](../../../environnement.md). Type du protocole : `PermissionRequest`, révisé par la feature 01.

**Files:**
- Modify: `client/src/state.ts`
- Modify: `client/src/state.test.ts`
- Create: `client/src/components/ApprovalBlock.tsx`
- Create: `client/src/components/ApprovalBlock.test.tsx`
- Modify: `client/src/components/Conversation.tsx`
- Modify: `client/src/screens/Session.tsx`
- Modify: `client/src/tokens.css`
- Create: `client/index.html` — modification, pour les fontes

**Interfaces:**
- Consomme : `PermissionRequest` et `ServerEvent` du protocole (feature 01), `ChatMessage` de `state.ts`.
- Produit :
  - `AppState.approvals: ApprovalEntry[]` et l'entrée `{kind: 'approval'}` dans le flux du fil.
  - `<ApprovalBlock entry={…} onDecide={(decision, reason?) => void} />`.

---

- [ ] **Step 1: Écrire les tests du réducteur, qui échouent**

Le fil doit rester **une seule séquence chronologique**. Un tableau de messages à côté d'un tableau d'approbations rendu après coup mettrait toutes les approbations en bas, quelle que soit leur date.

La solution retenue est un discriminant sur les éléments du fil. Ajouter à `client/src/state.test.ts` :

```ts
import { reduceEvent, initialState } from './state.ts';
import type { PermissionRequest } from '../../server/protocol.ts';

const request = (over: Partial<PermissionRequest> = {}): PermissionRequest => ({
  requestId: 'r1',
  toolUseId: 'tu1',
  toolName: 'Bash',
  input: { command: 'ls -la' },
  canAlwaysAllow: true,
  defaultToNo: false,
  ...over,
});

test('une demande entre dans le fil a sa place chronologique', () => {
  let state = initialState;
  state = reduceEvent(state, { type: 'message.complete', messageId: 'm1', role: 'user', text: 'salut' });
  state = reduceEvent(state, { type: 'permission.request', request: request() });
  state = reduceEvent(state, { type: 'message.complete', messageId: 'm2', role: 'assistant', text: 'fait' });

  expect(state.thread.map((e) => e.kind)).toEqual(['message', 'approval', 'message']);
});

test('la decision reste dans le fil au lieu de disparaitre', () => {
  let state = initialState;
  state = reduceEvent(state, { type: 'permission.request', request: request() });
  state = reduceEvent(state, { type: 'permission.resolved', requestId: 'r1', decision: 'allow' });

  expect(state.thread).toHaveLength(1);
  const entry = state.thread[0];
  expect(entry?.kind).toBe('approval');
  expect(entry?.kind === 'approval' && entry.decision).toBe('allow');
});

test('une demande rejouee apres reconnexion ne se duplique pas', () => {
  let state = initialState;
  state = reduceEvent(state, { type: 'permission.request', request: request() });
  state = reduceEvent(state, { type: 'permission.request', request: request() });

  expect(state.thread).toHaveLength(1);
});

test('une resolution pour une demande inconnue ne cree rien', () => {
  const state = reduceEvent(initialState, {
    type: 'permission.resolved',
    requestId: 'jamais-vu',
    decision: 'deny',
  });
  expect(state.thread).toHaveLength(0);
});

test('pendingApprovals ne compte que les demandes non tranchees', () => {
  let state = initialState;
  state = reduceEvent(state, { type: 'permission.request', request: request({ requestId: 'a' }) });
  state = reduceEvent(state, { type: 'permission.request', request: request({ requestId: 'b' }) });
  expect(state.thread.filter((e) => e.kind === 'approval' && e.decision === null)).toHaveLength(2);

  state = reduceEvent(state, { type: 'permission.resolved', requestId: 'a', decision: 'always' });
  expect(state.thread.filter((e) => e.kind === 'approval' && e.decision === null)).toHaveLength(1);
});
```

Les tests existants qui lisent `state.messages` doivent être adaptés à `state.thread` — c'est un renommage de structure, pas un changement de comportement, et il appartient à cette feature.

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `npm run test:client`
Expected: FAIL — `state.thread` est `undefined`

- [ ] **Step 3: Commit des tests rouges**

```bash
git add client/src/state.test.ts
git commit -m "test: le fil porte les demandes d approbation a leur place chronologique"
```

- [ ] **Step 4: Réécrire l'état du fil**

Dans `client/src/state.ts` :

```ts
import type { PermissionRequest, ServerEvent, SessionState } from '../../server/protocol.ts';

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

export type ThreadEntry = ChatMessage | ApprovalEntry;

export type AppState = {
  thread: ThreadEntry[];
  status: SessionState['status'];
  toolActivityCount: number;
  error: string | null;
};

export const initialState: AppState = {
  thread: [],
  status: 'idle',
  toolActivityCount: 0,
  error: null,
};
```

Le discriminant `kind` est ce qui permet au fil de rester une seule liste ordonnée. Le rendu filtre par `kind`, jamais l'état.

Les branches `message.delta` et `message.complete` cherchent désormais dans `state.thread` en filtrant sur `kind === 'message'`. Attention : `findIndex` doit porter sur `thread` pour que l'insertion garde l'ordre, pas sur une projection.

```ts
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
```

- [ ] **Step 5: Lancer les tests du réducteur**

Run: `npm run test:client`
Expected: les tests de `state.test.ts` passent. Ceux de `Session.test.tsx` et `Conversation` cassent — normal, ils lisent encore `messages`. Les steps suivants les rattrapent.

- [ ] **Step 6: Écrire les tests du bloc, qui échouent**

Créer `client/src/components/ApprovalBlock.test.tsx` :

```tsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApprovalBlock } from './ApprovalBlock.tsx';
import type { ApprovalEntry } from '../state.ts';

const entry = (over: Partial<ApprovalEntry['request']> = {}, decision: ApprovalEntry['decision'] = null): ApprovalEntry => ({
  kind: 'approval',
  id: 'r1',
  decision,
  request: {
    requestId: 'r1',
    toolUseId: 'tu1',
    toolName: 'Bash',
    input: { command: 'rm -rf build' },
    canAlwaysAllow: true,
    defaultToNo: false,
    ...over,
  },
});

test('le titre du SDK est affiche tel quel', () => {
  render(<ApprovalBlock entry={entry({ title: 'Claude veut lancer rm -rf build' })} onDecide={() => {}} />);
  expect(screen.getByText('Claude veut lancer rm -rf build')).toBeTruthy();
});

test('sans titre, le nom de l outil sert de repli', () => {
  render(<ApprovalBlock entry={entry()} onDecide={() => {}} />);
  expect(screen.getByText(/Bash/)).toBeTruthy();
});

test('le contenu exact soumis a approbation est affiche', () => {
  render(<ApprovalBlock entry={entry({ input: { command: 'rm -rf build' } })} onDecide={() => {}} />);
  expect(screen.getByText('rm -rf build')).toBeTruthy();
});

test('un Edit montre son chemin et son diff', () => {
  render(
    <ApprovalBlock
      entry={entry({
        toolName: 'Edit',
        input: { file_path: 'src/api.ts', old_string: 'const a = 1', new_string: 'const a = 2' },
      })}
      onDecide={() => {}}
    />
  );
  expect(screen.getByText(/src\/api\.ts/)).toBeTruthy();
  expect(screen.getByText(/-\s*const a = 1/)).toBeTruthy();
  expect(screen.getByText(/\+\s*const a = 2/)).toBeTruthy();
});

test('les trois actions sont presentes et remontent leur decision', () => {
  const decisions: string[] = [];
  render(<ApprovalBlock entry={entry()} onDecide={(d) => decisions.push(d)} />);

  fireEvent.click(screen.getByRole('button', { name: /^autoriser/i }));
  fireEvent.click(screen.getByRole('button', { name: /toujours/i }));
  expect(decisions).toEqual(['allow', 'always']);
});

test('refuser ouvre un champ de raison, transmise avec le refus', () => {
  const calls: [string, string | undefined][] = [];
  render(<ApprovalBlock entry={entry()} onDecide={(d, reason) => calls.push([d, reason])} />);

  fireEvent.click(screen.getByRole('button', { name: /refuser/i }));
  fireEvent.change(screen.getByLabelText(/raison/i), { target: { value: 'build est suivi par git' } });
  fireEvent.click(screen.getByRole('button', { name: /envoyer le refus/i }));

  expect(calls).toEqual([['deny', 'build est suivi par git']]);
});

test('le bouton toujours disparait quand canAlwaysAllow est faux', () => {
  render(<ApprovalBlock entry={entry({ canAlwaysAllow: false })} onDecide={() => {}} />);
  expect(screen.queryByRole('button', { name: /toujours/i })).toBeNull();
});

test('defaultToNo supprime le raccourci d approbation', () => {
  const { rerender } = render(<ApprovalBlock entry={entry({ defaultToNo: false })} onDecide={() => {}} />);
  expect(screen.getByRole('button', { name: /^autoriser/i }).textContent).toMatch(/a/i);

  rerender(<ApprovalBlock entry={entry({ defaultToNo: true })} onDecide={() => {}} />);
  const autoriser = screen.getByRole('button', { name: /^autoriser/i });
  expect(autoriser.querySelector('[data-shortcut]')).toBeNull();
});

test('une demande tranchee garde sa trace et perd ses actions', () => {
  render(<ApprovalBlock entry={entry({}, 'allow')} onDecide={() => {}} />);
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.getByText(/autorisé/i)).toBeTruthy();
});

test('un nom de serveur MCP hostile est rendu comme du texte, jamais comme du balisage', () => {
  const { container } = render(
    <ApprovalBlock
      entry={entry({ toolName: 'mcp__x__y', mcpServer: { name: '<img src=x onerror=alert(1)>', source: 'project' } })}
      onDecide={() => {}}
    />
  );
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText(/<img src=x onerror=alert\(1\)>/)).toBeTruthy();
});
```

Le dernier test est celui qui compte. React échappe le texte interpolé par construction ; ce test verrouille le fait qu'aucun `dangerouslySetInnerHTML` n'apparaîtra ici plus tard.

- [ ] **Step 7: Lancer pour vérifier l'échec**

Run: `npm run test:client`
Expected: FAIL — le module `ApprovalBlock.tsx` n'existe pas

- [ ] **Step 8: Écrire le bloc**

Créer `client/src/components/ApprovalBlock.tsx` :

```tsx
import { useState } from 'react';
import type { ApprovalEntry } from '../state.ts';

const DECISION_LABEL: Record<NonNullable<ApprovalEntry['decision']>, string> = {
  allow: 'Autorisé',
  always: 'Autorisé, et toujours pour cet outil',
  deny: 'Refusé',
};

/** Le contenu exact soumis à approbation, selon l'outil. Jamais une reformulation. */
function Body({ toolName, input }: { toolName: string; input: Record<string, unknown> }) {
  const mono = {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    whiteSpace: 'pre-wrap' as const,
    margin: 0,
  };

  if (toolName === 'Edit' || toolName === 'Write') {
    const path = typeof input.file_path === 'string' ? input.file_path : '';
    const before = typeof input.old_string === 'string' ? input.old_string : '';
    const after = typeof input.new_string === 'string' ? input.new_string : String(input.content ?? '');
    return (
      <div>
        <div style={{ ...mono, color: 'var(--text-muted)', marginBottom: 6 }}>{path}</div>
        {before !== '' && <pre style={{ ...mono, color: 'var(--danger)' }}>{`- ${before}`}</pre>}
        <pre style={{ ...mono, color: 'var(--ok, var(--accent))' }}>{`+ ${after}`}</pre>
      </div>
    );
  }

  const single = ['command', 'file_path', 'path', 'pattern']
    .map((key) => input[key])
    .find((value) => typeof value === 'string');

  return <pre style={mono}>{typeof single === 'string' ? single : JSON.stringify(input, null, 2)}</pre>;
}

export function ApprovalBlock({
  entry,
  onDecide,
}: {
  entry: ApprovalEntry;
  onDecide: (decision: 'allow' | 'always' | 'deny', reason?: string) => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const { request, decision } = entry;
  const settled = decision !== null;

  return (
    <section
      data-approval={request.requestId}
      style={{
        // docs/design-system.md : « Approval block — 1px `--warn` border, `--warn-soft` fill »,
        // et « 5px on controls and blocks ». `--warn` veut dire « approbation en attente » : une
        // demande tranchée n'attend plus, donc elle redevient neutre.
        border: `1px solid ${settled ? 'var(--border)' : 'var(--warn)'}`,
        borderRadius: 'var(--radius-control)',
        padding: 12,
        background: settled ? 'var(--surface-raised)' : 'var(--warn-soft)',
        opacity: settled ? 0.7 : 1,
      }}
    >
      <header style={{ fontSize: 13, marginBottom: 8, color: 'var(--text)' }}>
        {request.title ?? `${request.toolName}${describeTarget(request.input)}`}
      </header>

      {request.mcpServer && (
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 8 }}>
          serveur MCP : {request.mcpServer.name}
        </div>
      )}

      <Body toolName={request.toolName} input={request.input} />

      {settled ? (
        <footer style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          {DECISION_LABEL[decision]}
        </footer>
      ) : reason === null ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button type="button" className="pill" onClick={() => onDecide('allow')}>
            Autoriser
            {!request.defaultToNo && (
              <span data-shortcut style={{ color: 'var(--text-faint)' }}>a</span>
            )}
          </button>
          {request.canAlwaysAllow && (
            <button type="button" className="pill" onClick={() => onDecide('always')}>
              Toujours pour cet outil
            </button>
          )}
          <button type="button" className="pill" data-tone="warn" onClick={() => setReason('')}>
            Refuser
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input
            aria-label="Raison du refus"
            value={reason}
            autoFocus
            onChange={(e) => setReason(e.target.value)}
            style={{
              flex: 1,
              background: 'var(--surface)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-control)',
              padding: '4px 8px',
              font: 'inherit',
              fontSize: 12,
            }}
          />
          <button type="button" className="pill" onClick={() => onDecide('deny', reason)}>
            Envoyer le refus
          </button>
        </div>
      )}
    </section>
  );
}

function describeTarget(input: Record<string, unknown>): string {
  for (const key of ['file_path', 'path', 'command', 'pattern']) {
    const value = input[key];
    if (typeof value === 'string') return ` ${value}`;
  }
  return '';
}
```

`defaultToNo` ne masque pas le bouton — il supprime le raccourci clavier affiché dessus. C'est exactement ce que demande le SDK : la demande ne doit pas être approuvable par une frappe parasite.

- [ ] **Step 9: Lancer les tests du bloc**

Run: `npm run test:client`
Expected: les tests de `ApprovalBlock.test.tsx` passent

- [ ] **Step 10: Rendre le fil**

Dans `client/src/components/Conversation.tsx`, remplacer `messages: ChatMessage[]` par `thread: ThreadEntry[]` et brancher le rendu par `kind` :

```tsx
import type { ThreadEntry } from '../state.ts';
import { ApprovalBlock } from './ApprovalBlock.tsx';

export function Conversation({
  thread,
  error,
  onDecide,
}: {
  thread: ThreadEntry[];
  error: string | null;
  onDecide: (requestId: string, decision: 'allow' | 'always' | 'deny', reason?: string) => void;
}) {
```

et dans la boucle :

```tsx
      {thread.map((entry) =>
        entry.kind === 'approval' ? (
          <ApprovalBlock
            key={entry.id}
            entry={entry}
            onDecide={(decision, reason) => onDecide(entry.id, decision, reason)}
          />
        ) : (
          <article key={entry.id} data-role={entry.role} style={{ /* inchangé */ }}>
            {entry.text}
          </article>
        )
      )}
```

Dans `client/src/screens/Session.tsx`, adapter l'appel :

```tsx
          <Conversation
            thread={state.thread}
            error={state.error}
            onDecide={(requestId, decision, reason) =>
              connection.current?.send({ type: 'permission.respond', requestId, decision, reason })
            }
          />
```

- [ ] **Step 11: Charger les fontes déclarées**

Mineur §3.4 de la revue finale de la tranche 1, intercalé ici : c'est cette feature qui rend du texte en `var(--font-mono)` pour la première fois, donc la première où une fonte manquante se voit.

`tokens.css` déclare `--font-ui: Inter` et `--font-mono: 'JetBrains Mono'`. Ni l'une ni l'autre n'est chargée ; le navigateur retombe sur les replis.

Deux options, une seule est retenue. Charger depuis Google Fonts ajoute une dépendance réseau à une application locale, ce qui est exactement ce que ce projet refuse ailleurs. Ne rien charger et garder des noms qui mentent est pire.

**Retenu : aligner la déclaration sur la réalité.** Dans `client/src/tokens.css` :

```css
  --font-ui: system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono: ui-monospace, 'Cascadia Mono', 'SF Mono', Menlo, monospace;
```

Les piles système rendent bien sur les trois plateformes, ne coûtent rien et ne mentent pas. Si Inter devient souhaitable plus tard, elle sera empaquetée en local, pas appelée à distance.

- [ ] **Step 12: Lancer toute la suite**

Run: `npm test && npm run test:client && npm run typecheck && npm run build`
Expected: tout vert. Les tests de `Session.test.tsx` qui lisaient `messages` ont dû être adaptés à `thread` au step 4.

- [ ] **Step 13: Commit**

```bash
git add client/src/state.ts client/src/state.test.ts client/src/components/ApprovalBlock.tsx client/src/components/ApprovalBlock.test.tsx client/src/components/Conversation.tsx client/src/screens/Session.tsx client/src/screens/Session.test.tsx client/src/tokens.css
git commit -m "feat: bloc d approbation dans le fil, avec le contenu exact et ses trois actions"
```
