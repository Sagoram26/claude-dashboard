# Feature 03 — La ligne de rappel ancrée

Objectif : pendant l'attente d'une décision, une ligne au-dessus du composeur permet de répondre sans remonter le fil. Elle n'existe pas le reste du temps.

C'est la seconde surface de la section 3.6 du spec. La première, le bloc, est chronologique et permanente ; celle-ci est ancrée et éphémère.

`docs/ui-spec.md` section 2.5 : elle porte le nombre de demandes en attente, un bouton pour autoriser directement, et un bouton pour remonter au bloc correspondant. Et section 2.2 : pendant l'attente, **la saisie reste utilisable**. On n'est pas bloqué, on est sollicité.

**Files:**
- Create: `client/src/components/PendingApprovalBar.tsx`
- Create: `client/src/components/PendingApprovalBar.test.tsx`
- Modify: `client/src/screens/Session.tsx`
- Modify: `client/src/screens/Session.test.tsx`
- Modify: `client/src/components/GeneratingIndicator.tsx`
- Modify: `client/src/tokens.css`

**Interfaces:**
- Consomme : `ApprovalEntry` de la feature 02, `AppState.thread`.
- Produit : `<PendingApprovalBar pending={ApprovalEntry[]} onAllow={(requestId) => void} onReveal={(requestId) => void} />`.

---

- [ ] **Step 1: Écrire les tests du rappel, qui échouent**

Créer `client/src/components/PendingApprovalBar.test.tsx` :

```tsx
import { test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PendingApprovalBar } from './PendingApprovalBar.tsx';
import type { ApprovalEntry } from '../state.ts';

const pending = (id: string, toolName = 'Bash'): ApprovalEntry => ({
  kind: 'approval',
  id,
  decision: null,
  request: {
    requestId: id,
    toolUseId: `tu-${id}`,
    toolName,
    input: { command: 'ls' },
    canAlwaysAllow: true,
    defaultToNo: false,
  },
});

test('une seule demande nomme l outil', () => {
  render(<PendingApprovalBar pending={[pending('r1', 'Edit')]} onAllow={() => {}} onReveal={() => {}} />);
  expect(screen.getByRole('status').textContent).toMatch(/Edit/);
});

test('plusieurs demandes affichent leur nombre', () => {
  render(
    <PendingApprovalBar
      pending={[pending('r1'), pending('r2'), pending('r3')]}
      onAllow={() => {}}
      onReveal={() => {}}
    />
  );
  expect(screen.getByRole('status').textContent).toMatch(/3/);
});

test('autoriser porte sur la demande la plus ancienne', () => {
  const allowed: string[] = [];
  render(
    <PendingApprovalBar
      pending={[pending('r1'), pending('r2')]}
      onAllow={(id) => allowed.push(id)}
      onReveal={() => {}}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /autoriser/i }));
  expect(allowed).toEqual(['r1']);
});

test('voir la demande remonte au bloc correspondant', () => {
  const revealed: string[] = [];
  render(
    <PendingApprovalBar pending={[pending('r1')]} onAllow={() => {}} onReveal={(id) => revealed.push(id)} />
  );
  fireEvent.click(screen.getByRole('button', { name: /voir/i }));
  expect(revealed).toEqual(['r1']);
});

test('sans demande en attente, rien n est rendu', () => {
  const { container } = render(<PendingApprovalBar pending={[]} onAllow={() => {}} onReveal={() => {}} />);
  expect(container.firstChild).toBeNull();
});

test('le rappel est annonce aux lecteurs d ecran', () => {
  render(<PendingApprovalBar pending={[pending('r1')]} onAllow={() => {}} onReveal={() => {}} />);
  expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `npm run test:client`
Expected: FAIL — le module n'existe pas

- [ ] **Step 3: Écrire les tests d'intégration de l'écran, qui échouent**

Ajouter à `client/src/screens/Session.test.tsx`. Ces tests utilisent `FakeWebSocket` de `client/src/test-doubles.ts` — **ne pas en redéclarer un**, c'est la duplication que la tranche 1 a fini par payer.

Tous les appels de listener passent par `act()` : c'est le correctif du mineur #10, intercalé ici puisque cette feature réécrit le fichier.

```tsx
import { act } from 'react';
import { FakeWebSocket } from '../test-doubles.ts';

const emit = (event: unknown) => {
  act(() => {
    FakeWebSocket.instances[0]?.onmessage?.({ data: JSON.stringify(event) });
  });
};

const demande = {
  requestId: 'r1',
  toolUseId: 'tu1',
  toolName: 'Bash',
  input: { command: 'ls' },
  canAlwaysAllow: true,
  defaultToNo: false,
};

test('le rappel apparait pendant l attente et disparait apres la decision', () => {
  render(<Session />);

  expect(screen.queryByRole('status')).toBeNull();

  emit({ type: 'permission.request', request: demande });
  expect(screen.getByRole('status').textContent).toMatch(/Bash/);

  emit({ type: 'permission.resolved', requestId: 'r1', decision: 'allow' });
  expect(screen.queryByRole('status')).toBeNull();
});

test('autoriser depuis le rappel envoie la commande au serveur', () => {
  render(<Session />);
  emit({ type: 'permission.request', request: demande });

  fireEvent.click(screen.getByRole('button', { name: /autoriser/i }));

  const sent = FakeWebSocket.instances[0]?.sent.map((s) => JSON.parse(s)) ?? [];
  expect(sent).toContainEqual({ type: 'permission.respond', requestId: 'r1', decision: 'allow' });
});

test('la saisie reste utilisable pendant l attente', () => {
  render(<Session />);
  emit({
    type: 'session.state',
    state: { sessionId: 's1', cwd: '/tmp', status: 'awaiting-permission', model: null, permissionMode: 'default' },
  });
  emit({ type: 'permission.request', request: demande });

  const champ = screen.getByLabelText('Message') as HTMLTextAreaElement;
  expect(champ.disabled).toBe(false);
});

test('le bloc du fil et le rappel repondent tous les deux', () => {
  render(<Session />);
  emit({ type: 'permission.request', request: demande });

  expect(screen.getAllByRole('button', { name: /autoriser/i }).length).toBeGreaterThanOrEqual(2);
});
```

Le dernier test est celui qui a de la valeur : il vérifie que les deux surfaces coexistent, ce qui est la décision de conception de la section 3.6.

- [ ] **Step 4: Commit des tests rouges**

```bash
git add client/src/components/PendingApprovalBar.test.tsx client/src/screens/Session.test.tsx
git commit -m "test: le rappel ancre d approbation, tests en echec"
```

- [ ] **Step 5: Écrire le rappel**

Créer `client/src/components/PendingApprovalBar.tsx` :

```tsx
import type { ApprovalEntry } from '../state.ts';

export function PendingApprovalBar({
  pending,
  onAllow,
  onReveal,
}: {
  pending: ApprovalEntry[];
  onAllow: (requestId: string) => void;
  onReveal: (requestId: string) => void;
}) {
  const first = pending[0];
  if (!first) return null;

  const label =
    pending.length === 1
      ? `${first.request.displayName ?? first.request.toolName} attend votre décision`
      : `${pending.length} demandes attendent votre décision`;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        marginBottom: 8,
        fontSize: 12,
        color: 'var(--text)',
        background: 'var(--warn-soft)',
        border: '1px solid var(--warn)',
        borderRadius: 'var(--radius-control)',
      }}
    >
      <span>{label}</span>
      <button
        type="button"
        className="pill"
        style={{ marginLeft: 'auto' }}
        onClick={() => onReveal(first.id)}
      >
        Voir la demande
      </button>
      <button type="button" className="pill" onClick={() => onAllow(first.id)}>
        Autoriser
      </button>
    </div>
  );
}
```

Le rappel se signale en `--warn`, pas en `--danger` : une demande d'approbation n'est pas une erreur, c'est une sollicitation.

- [ ] **Step 6: Câbler dans l'écran**

Dans `client/src/screens/Session.tsx` :

```tsx
const pendingApprovals = state.thread.filter(
  (e): e is ApprovalEntry => e.kind === 'approval' && e.decision === null
);
```

et entre l'indicateur de génération et le composeur :

```tsx
<PendingApprovalBar
  pending={pendingApprovals}
  onAllow={(requestId) =>
    connection.current?.send({ type: 'permission.respond', requestId, decision: 'allow' })
  }
  onReveal={(requestId) =>
    document
      .querySelector(`[data-approval="${requestId}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'auto' })
  }
/>
```

`behavior: 'auto'` et non `'smooth'` : le design system interdit le mouvement décoratif, et jsdom n'implémente pas `scrollIntoView` avec options de toute façon — le test de `onReveal` vérifie le rappel, pas le défilement.

Le sélecteur `[data-approval]` existe grâce à l'attribut posé par `ApprovalBlock` à la feature 02.

- [ ] **Step 7: Combler le trou d'accessibilité pendant qu'on y est**

Mineurs #12 et §3.3 de la revue finale de la tranche 1, intercalés ici : même zone, mêmes fichiers.

Dans `client/src/components/GeneratingIndicator.tsx`, ajouter `role="status"` au conteneur. Trois caractères, et l'indicateur devient annonçable.

Dans `client/src/tokens.css`, le design system promet quatre états par élément interactif et un focus jamais supprimé. La classe `.pill` n'en a qu'un. Ajouter :

```css
.pill:hover:not(:disabled) {
  border-color: var(--border-strong);
}

.pill:active:not(:disabled) {
  background: var(--surface);
}

.pill:disabled {
  opacity: 0.45;
  cursor: default;
}

.pill:focus-visible,
textarea:focus-visible,
input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
```

`:focus-visible` plutôt que `:focus` : l'anneau apparaît à la navigation clavier et pas au clic à la souris, ce qui est le comportement attendu et ce qui évite qu'on soit tenté de le supprimer.

Vérifier qu'aucune règle existante ne porte `outline: none` :

```bash
grep -rn "outline" client/src/
```

- [ ] **Step 8: Lancer toute la suite**

Run: `npm test && npm run test:client && npm run typecheck`
Expected: tout vert, **et aucun avertissement `act(...)` dans la sortie de `test:client`**

Si un avertissement `act(...)` subsiste, il vient d'un test qui appelle un listener hors `act`. Le corriger, ne pas l'ignorer : c'est le mineur #10 qu'on est en train de clore.

- [ ] **Step 9: Commit**

```bash
git add client/src/components/PendingApprovalBar.tsx client/src/components/PendingApprovalBar.test.tsx client/src/components/GeneratingIndicator.tsx client/src/screens/Session.tsx client/src/screens/Session.test.tsx client/src/tokens.css
git commit -m "feat: rappel ancre d approbation au-dessus du composeur"
```
