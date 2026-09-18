# Feature 05 — L'écran Réglages

Objectif : la coquille de l'écran 3 du spec, avec une seule section remplie — Permissions accordées, et sa révocation.

`docs/ui-spec.md` : « La section "Permissions accordées" n'est pas optionnelle : sans elle, "Toujours pour cet outil" accorde un droit qu'on ne sait plus retirer. » C'est la raison d'être de cette feature à cette place dans la tranche, et pas plus tard.

Les cinq autres sections — Serveurs MCP, Hooks, Prompts, Workflows, Process — sont **annoncées et vides**, avec la tranche qui les remplira. Une section absente se redécouvre ; une section vide et datée se complète.

**Files:**
- Create: `client/src/screens/Settings.tsx`
- Create: `client/src/screens/Settings.test.tsx`
- Modify: `client/src/state.ts`
- Modify: `client/src/state.test.ts`
- Modify: `client/src/screens/Session.tsx` — c'est lui qui tient l'écran courant
- Modify: `client/src/components/TopBar.tsx`
- Modify: `client/src/screens/Session.test.tsx`

**Interfaces:**
- Consomme : `GrantedPermission` et l'événement `permission.granted` de la feature 04.
- Produit : `<Settings granted={GrantedPermission[]} onRevoke={(toolName) => void} onClose={() => void} />`, et `AppState.granted`.

---

- [ ] **Step 1: Écrire les tests du réducteur, qui échouent**

Ajouter à `client/src/state.test.ts` :

```ts
test('permission.granted remplace la liste au lieu de l accumuler', () => {
  let state = initialState;
  state = reduceEvent(state, {
    type: 'permission.granted',
    granted: [{ toolName: 'Bash', grantedAt: '2026-09-18T10:00:00.000Z' }],
  });
  state = reduceEvent(state, {
    type: 'permission.granted',
    granted: [
      { toolName: 'Bash', grantedAt: '2026-09-18T10:00:00.000Z' },
      { toolName: 'Read', grantedAt: '2026-09-18T10:05:00.000Z' },
    ],
  });

  expect(state.granted.map((g) => g.toolName)).toEqual(['Bash', 'Read']);
});

test('une revocation cote serveur vide la liste', () => {
  let state = reduceEvent(initialState, {
    type: 'permission.granted',
    granted: [{ toolName: 'Bash', grantedAt: '2026-09-18T10:00:00.000Z' }],
  });
  state = reduceEvent(state, { type: 'permission.granted', granted: [] });
  expect(state.granted).toEqual([]);
});
```

Le serveur envoie toujours la liste complète, jamais un delta. Le réducteur remplace ; il ne fusionne pas. Une fusion aurait rendu la révocation impossible à exprimer.

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `npm run test:client`
Expected: FAIL — `state.granted` est `undefined`

- [ ] **Step 3: Écrire les tests de l'écran, qui échouent**

Créer `client/src/screens/Settings.test.tsx` :

```tsx
import { test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Settings } from './Settings.tsx';

const granted = [
  { toolName: 'Bash', grantedAt: '2026-09-18T10:00:00.000Z' },
  { toolName: 'Read', grantedAt: '2026-09-18T10:05:00.000Z' },
];

test('les permissions accordees sont listees', () => {
  render(<Settings granted={granted} onRevoke={() => {}} onClose={() => {}} />);
  expect(screen.getByText('Bash')).toBeTruthy();
  expect(screen.getByText('Read')).toBeTruthy();
});

test('chaque permission a son bouton de revocation, qui nomme l outil', () => {
  const revoques: string[] = [];
  render(<Settings granted={granted} onRevoke={(t) => revoques.push(t)} onClose={() => {}} />);

  fireEvent.click(screen.getByRole('button', { name: /révoquer Bash/i }));
  expect(revoques).toEqual(['Bash']);
});

test('sans permission accordee, la section le dit au lieu d etre vide', () => {
  render(<Settings granted={[]} onRevoke={() => {}} onClose={() => {}} />);
  expect(screen.getByText(/aucune permission/i)).toBeTruthy();
});

test('les sections a venir sont annoncees avec leur tranche', () => {
  render(<Settings granted={[]} onRevoke={() => {}} onClose={() => {}} />);
  expect(screen.getByText(/serveurs mcp/i)).toBeTruthy();
  expect(screen.getByText(/workflows/i)).toBeTruthy();
  expect(screen.getAllByText(/à venir/i).length).toBeGreaterThan(0);
});

test('echap ferme l ecran', () => {
  let ferme = 0;
  render(<Settings granted={[]} onRevoke={() => {}} onClose={() => (ferme += 1)} />);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(ferme).toBe(1);
});

test('la date d octroi est affichee de maniere lisible', () => {
  render(<Settings granted={granted} onRevoke={() => {}} onClose={() => {}} />);
  expect(screen.getByText(/2026/)).toBeTruthy();
});
```

- [ ] **Step 4: Commit des tests rouges**

```bash
git add client/src/state.test.ts client/src/screens/Settings.test.tsx
git commit -m "test: ecran de reglages et permissions accordees, tests en echec"
```

- [ ] **Step 5: Ajouter `granted` à l'état**

Dans `client/src/state.ts`, ajouter `granted: GrantedPermission[]` à `AppState`, `granted: []` à `initialState`, et la branche :

```ts
    case 'permission.granted':
      return { ...state, granted: event.granted };
```

Retirer `permission.granted` de la liste des cas inertes ajoutée à la feature 04.

- [ ] **Step 6: Écrire l'écran**

Créer `client/src/screens/Settings.tsx` :

```tsx
import { useEffect } from 'react';
import type { GrantedPermission } from '../../../server/protocol.ts';

const A_VENIR: [string, string][] = [
  ['Serveurs MCP', 'tranche 3'],
  ['Hooks', 'tranche 3'],
  ['Prompts', 'tranche 4'],
  ['Workflows', 'tranche 4'],
  ['Process', 'tranche 4'],
];

export function Settings({
  granted,
  onRevoke,
  onClose,
}: {
  granted: GrantedPermission[];
  onRevoke: (toolName: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 'var(--conversation-max)', padding: '24px 0' }}>
        <header style={{ display: 'flex', alignItems: 'baseline', marginBottom: 20 }}>
          <h1 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>Réglages</h1>
          <button type="button" className="pill" style={{ marginLeft: 'auto' }} onClick={onClose}>
            Fermer <span style={{ color: 'var(--text-faint)' }}>esc</span>
          </button>
        </header>

        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 13, fontWeight: 500, margin: '0 0 4px' }}>Permissions accordées</h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 10px' }}>
            Les outils pour lesquels vous avez choisi « Toujours ». Ils ne demandent plus.
          </p>

          {granted.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>
              Aucune permission accordée.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {granted.map((permission) => (
                <li
                  key={permission.toolName}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 0',
                    borderTop: '1px solid var(--border)',
                    fontSize: 12,
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{permission.toolName}</span>
                  <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>
                    {new Date(permission.grantedAt).toLocaleString('fr-FR')}
                  </span>
                  <button
                    type="button"
                    className="pill"
                    data-tone="warn"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => onRevoke(permission.toolName)}
                  >
                    Révoquer {permission.toolName}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {A_VENIR.map(([titre, tranche]) => (
          <section key={titre} style={{ marginBottom: 14, opacity: 0.55 }}>
            <h2 style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>
              {titre} <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>— à venir, {tranche}</span>
            </h2>
          </section>
        ))}
      </div>
    </div>
  );
}
```

Le bouton porte « Révoquer Bash », pas « Révoquer » : dans une liste, un nom accessible répété autant de fois qu'il y a de lignes ne désigne rien. C'est ce que vérifie le test.

- [ ] **Step 7: Câbler la navigation**

L'application a deux écrans. Pas de routeur — une dépendance de production pour un booléen serait exactement ce que `CLAUDE.md` interdit.

Il n'y a pas de `App.tsx` dans ce projet : `main.tsx` monte `Session` directement. L'écran courant est donc tenu par `Session.tsx`, ce qui est aussi le bon endroit — la barre supérieure et le pied de page restent, seul le `<main>` change :

```tsx
const [screen, setScreen] = useState<'session' | 'settings'>('session');
```

`TopBar` reçoit une action pour l'ouvrir. Ajouter à ses props :

```tsx
export function TopBar({ controls, onOpenSettings }: { controls: ControlPill[]; onOpenSettings?: () => void }) {
```

et avant le `⌘K` :

```tsx
      <button
        type="button"
        className="pill"
        aria-label="Réglages"
        style={{ marginLeft: 'auto' }}
        onClick={onOpenSettings}
      >
        ⚙
      </button>
      <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>⌘K</span>
```

Le `marginLeft: 'auto'` passe du `⌘K` au bouton de réglages : c'est lui qui pousse désormais le groupe à droite.

L'écran de réglages remplace le `<main>`, pas la barre supérieure ni le pied de page : on reste dans la même session, on la configure.

- [ ] **Step 8: Trancher le conflit sur la touche Échap**

Mineur #11 de la revue finale de la tranche 1. Le voici dû : Échap a maintenant deux sens.

`Session.tsx` écoute Échap sur `window` pour interrompre la génération, et `Settings.tsx` l'écoute pour se fermer. Les deux écouteurs coexistent — si les réglages sont ouverts pendant une génération, Échap ferait les deux.

**Retenu : un seul écouteur actif à la fois.** L'écouteur d'interruption de `Session.tsx` ne s'installe que si l'écran courant est `'session'` :

```tsx
  useEffect(() => {
    if (screen !== 'session' || state.status !== 'generating') return;
    // … inchangé
  }, [screen, state.status]);
```

Pas de filtrage de cible, pas de gestionnaire global de priorités. L'écran au premier plan possède Échap ; c'est la règle la plus simple qui soit juste, et elle tiendra jusqu'aux popovers de la tranche 3.

Ajouter le test qui le verrouille, dans `Session.test.tsx` :

```tsx
test('echap ne coupe pas la generation quand les reglages sont ouverts', () => {
  render(<Session />);
  emit({
    type: 'session.state',
    state: { sessionId: 's1', cwd: '/tmp', status: 'generating', model: null, permissionMode: null },
  });

  fireEvent.click(screen.getByRole('button', { name: /réglages/i }));
  fireEvent.keyDown(window, { key: 'Escape' });

  const sent = FakeWebSocket.instances[0]?.sent.map((s) => JSON.parse(s)) ?? [];
  expect(sent).not.toContainEqual({ type: 'session.interrupt' });
});
```

- [ ] **Step 9: Brancher la révocation**

```tsx
<Settings
  granted={state.granted}
  onRevoke={(toolName) => connection.current?.send({ type: 'permission.revoke', toolName })}
  onClose={() => setScreen('session')}
/>
```

- [ ] **Step 10: Lancer toute la suite**

Run: `npm test && npm run test:client && npm run typecheck && npm run build`
Expected: tout vert

- [ ] **Step 11: Vérification manuelle du cycle complet**

Serveur et client démarrés, dans un dossier de travail réel :

1. Provoquer une demande, choisir « Toujours pour cet outil ».
2. Ouvrir les réglages : l'outil est listé avec sa date.
3. Refaire la même action : aucune demande n'apparaît.
4. Révoquer depuis les réglages.
5. Refaire l'action : la demande revient.

Les points 1 à 3 et 5 passent par le vrai SDK. Si vous ne pouvez pas les exécuter, dites-le plutôt que de les déclarer.

- [ ] **Step 12: Commit**

```bash
git add client/src/screens/Settings.tsx client/src/screens/Settings.test.tsx client/src/state.ts client/src/state.test.ts client/src/components/TopBar.tsx client/src/screens/Session.tsx client/src/screens/Session.test.tsx
git commit -m "feat: ecran de reglages avec permissions accordees et revocation"
```
