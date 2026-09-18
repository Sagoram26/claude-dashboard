# Feature 06 — Les contrôles à chaud

Objectif : modèle, effort et mode de permission changent en cours de session, sans perdre le contexte.

C'est ce qui fait qu'on ne retourne pas au terminal. `docs/ui-spec.md` section 2.1 : trois menus déroulants dans la barre supérieure, tous changeables à chaud. Cette feature remplace enfin `PLACEHOLDER_CONTROLS`.

## Les signatures, extraites de `docs/environnement.md`

Les trois méthodes vivent sur l'objet `Query` — accessible par `manager.control()` depuis la feature 01.

```ts
setPermissionMode(mode: PermissionMode): Promise<void>;   // sdk.d.ts:2675
setModel(model?: string): Promise<void>;                   // sdk.d.ts:2703
applyFlagSettings(settings: {...}): Promise<void>;         // sdk.d.ts:2749
supportedModels(): Promise<ModelInfo[]>;                   // sdk.d.ts:2802
```

**Trois choses à ne pas se tromper :**

`setModel` et `setPermissionMode` prennent **un argument positionnel**. `applyFlagSettings` prend **un objet groupé** — c'est par lui que passe l'effort : `applyFlagSettings({effortLevel: 'high'})`.

Les quatre sont `async` et **« only available in streaming input mode »**. La session du dashboard est en mode flux depuis la tranche 1, donc c'est acquis — mais un appel avant que la session soit établie peut échouer. Chaque appel est protégé.

Les valeurs exactes, jamais réinventées :

```ts
type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto';
type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
```

`bypassPermissions` exige `allowDangerouslySkipPermissions` côté SDK. Il figure dans la liste du SDK ; **il n'entre pas dans le menu de la v1.** Offrir en deux clics le mode qui désarme tout ce que cette tranche construit n'a pas de sens, et le rendre inerte dans le menu serait pire. Il reste accessible par le terminal, qui est le bon endroit pour une décision de cette portée.

**Files:**
- Modify: `server/protocol.ts`
- Modify: `server/session/manager.ts`
- Modify: `server/session/manager.test.ts`
- Modify: `server/index.ts`
- Modify: `client/src/state.ts`
- Modify: `client/src/state.test.ts`
- Create: `client/src/components/ControlMenu.tsx`
- Create: `client/src/components/ControlMenu.test.tsx`
- Modify: `client/src/components/TopBar.tsx`
- Modify: `client/src/screens/Session.tsx`

**Interfaces:**
- Consomme : `SessionManager.control()` de la feature 01, la commande `runtime.set` déjà déclarée au protocole.
- Produit : `SessionManager.applyRuntime({model?, effort?, permissionMode?}): Promise<void>`, et `<ControlMenu label options value onSelect />`.

---

- [ ] **Step 1: Compléter `SessionState` au protocole**

`SessionState` porte `model` et `permissionMode`, mais pas l'effort, et `permissionMode` n'a jamais été renseigné (mineur #6 de la tranche 1, échu ici).

```ts
export type SessionState = {
  sessionId: string | null;
  cwd: string;
  status: 'idle' | 'generating' | 'awaiting-permission' | 'disconnected';
  model: string | null;
  permissionMode: string | null;
  effort: string | null;
  /** Peuplé par `query.supportedModels()`. Vide tant que la session n'est pas établie. */
  availableModels: { value: string; displayName: string }[];
};
```

Les types restent `string | null` et non les unions du SDK : le protocole voyage en JSON et ne doit pas obliger le client à importer des types SDK. Le serveur valide, le client affiche.

Mettre à jour l'état initial dans `manager.ts` en conséquence.

- [ ] **Step 2: Écrire les tests serveur, qui échouent**

Ajouter à `server/session/manager.test.ts`. Le faux `query` doit maintenant porter les méthodes de contrôle :

```ts
function fakeControl() {
  const calls: [string, unknown][] = [];
  return {
    calls,
    methods: {
      setModel: async (m?: string) => { calls.push(['setModel', m]); },
      setPermissionMode: async (m: string) => { calls.push(['setPermissionMode', m]); },
      applyFlagSettings: async (s: unknown) => { calls.push(['applyFlagSettings', s]); },
      supportedModels: async () => [
        { value: 'claude-opus-5', displayName: 'Opus 5', description: '' },
        { value: 'claude-sonnet-5', displayName: 'Sonnet 5', description: '' },
      ],
      interrupt: async () => undefined,
    },
  };
}

test('changer de modele appelle setModel et met a jour l etat', async () => {
  const control = fakeControl();
  const states: string[] = [];
  const { query } = fakeQuery(() => [], control.methods);

  const manager = createSessionManager({
    cwd: '/tmp',
    emit: (e) => { if (e.type === 'session.state' && e.state.model) states.push(e.state.model); },
    queryFn: query,
  });

  await manager.applyRuntime({ model: 'claude-sonnet-5' });

  assert.deepEqual(control.calls, [['setModel', 'claude-sonnet-5']]);
  assert.equal(manager.state().model, 'claude-sonnet-5');
  await manager.stop();
});

test('l effort passe par applyFlagSettings, pas par setModel', async () => {
  const control = fakeControl();
  const { query } = fakeQuery(() => [], control.methods);
  const manager = createSessionManager({ cwd: '/tmp', emit: () => {}, queryFn: query });

  await manager.applyRuntime({ effort: 'high' });

  assert.deepEqual(control.calls, [['applyFlagSettings', { effortLevel: 'high' }]]);
  assert.equal(manager.state().effort, 'high');
  await manager.stop();
});

test('les trois reglages en un appel font trois appels SDK', async () => {
  const control = fakeControl();
  const { query } = fakeQuery(() => [], control.methods);
  const manager = createSessionManager({ cwd: '/tmp', emit: () => {}, queryFn: query });

  await manager.applyRuntime({ model: 'claude-opus-5', effort: 'low', permissionMode: 'plan' });

  assert.deepEqual(control.calls.map(([name]) => name).sort(), [
    'applyFlagSettings',
    'setModel',
    'setPermissionMode',
  ]);
  await manager.stop();
});

test('un reglage absent n appelle rien', async () => {
  const control = fakeControl();
  const { query } = fakeQuery(() => [], control.methods);
  const manager = createSessionManager({ cwd: '/tmp', emit: () => {}, queryFn: query });

  await manager.applyRuntime({});

  assert.deepEqual(control.calls, []);
  await manager.stop();
});

test('une valeur de mode inconnue est rejetee sans appeler le SDK', async () => {
  const control = fakeControl();
  const errors: string[] = [];
  const { query } = fakeQuery(() => [], control.methods);
  const manager = createSessionManager({
    cwd: '/tmp',
    emit: (e) => { if (e.type === 'error') errors.push(e.message); },
    queryFn: query,
  });

  await manager.applyRuntime({ permissionMode: 'rm-rf' });

  assert.deepEqual(control.calls, []);
  assert.equal(errors.length, 1);
  await manager.stop();
});

test('bypassPermissions est refuse en v1', async () => {
  const control = fakeControl();
  const { query } = fakeQuery(() => [], control.methods);
  const manager = createSessionManager({ cwd: '/tmp', emit: () => {}, queryFn: query });

  await manager.applyRuntime({ permissionMode: 'bypassPermissions' });

  assert.deepEqual(control.calls, [], 'le mode qui desarme la tranche entiere ne passe pas par l interface');
  await manager.stop();
});

test('un echec du SDK emet une erreur sans faire tomber la session', async () => {
  const errors: string[] = [];
  const { query } = fakeQuery(() => [], {
    ...fakeControl().methods,
    setModel: async () => { throw new Error('pas en mode flux'); },
  });
  const manager = createSessionManager({
    cwd: '/tmp',
    emit: (e) => { if (e.type === 'error') errors.push(e.message); },
    queryFn: query,
  });

  await assert.doesNotReject(() => manager.applyRuntime({ model: 'x' }));
  assert.deepEqual(errors, ['pas en mode flux']);
  assert.notEqual(manager.state().model, 'x', 'l etat ne doit pas mentir sur un appel qui a echoue');
  await manager.stop();
});

test('les modeles disponibles sont pousses a l initialisation', async () => {
  const control = fakeControl();
  const { query, push } = fakeQuery(() => [], control.methods);
  const etats: unknown[] = [];
  const manager = createSessionManager({
    cwd: '/tmp',
    emit: (e) => { if (e.type === 'session.state') etats.push(e.state.availableModels); },
    queryFn: query,
  });

  push({ type: 'system', subtype: 'init', session_id: 's1', model: 'claude-opus-5', uuid: 'i1' });
  await new Promise((r) => setTimeout(r, 20));

  const dernier = etats.at(-1) as { value: string }[];
  assert.deepEqual(dernier.map((m) => m.value), ['claude-opus-5', 'claude-sonnet-5']);
  await manager.stop();
});
```

Le double `fakeQuery` doit accepter un second argument portant les méthodes de contrôle. Il vit dans `manager.test.ts` depuis la tranche 1 : l'étendre là, pas en créer un second.

- [ ] **Step 3: Lancer pour vérifier l'échec**

Run: `npm test`
Expected: FAIL — `manager.applyRuntime is not a function`

- [ ] **Step 4: Commit des tests rouges**

```bash
git add server/session/manager.test.ts server/protocol.ts
git commit -m "test: controles a chaud modele effort et mode, tests en echec"
```

- [ ] **Step 5: Implémenter côté serveur**

Dans `server/session/manager.ts`, les valeurs autorisées, copiées de `docs/environnement.md` :

```ts
// Valeurs exactes du SDK (sdk.d.ts:2366 et 623). `bypassPermissions` est volontairement absent de
// la liste offerte par l'interface : il désarme tout ce que la tranche 2 construit, et un tel choix
// se prend au terminal, pas en deux clics.
const MODES_OFFERTS = ['default', 'acceptEdits', 'plan', 'dontAsk', 'auto'] as const;
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
```

Puis la méthode :

```ts
    async applyRuntime(reglages: { model?: string; effort?: string; permissionMode?: string }) {
      const patch: Partial<SessionState> = {};

      try {
        if (reglages.permissionMode !== undefined) {
          if (!MODES_OFFERTS.includes(reglages.permissionMode as never)) {
            throw new Error(`Mode de permission non offert : ${reglages.permissionMode}`);
          }
          await session.setPermissionMode(reglages.permissionMode as never);
          patch.permissionMode = reglages.permissionMode;
        }

        if (reglages.model !== undefined) {
          await session.setModel(reglages.model);
          patch.model = reglages.model;
        }

        if (reglages.effort !== undefined) {
          if (!EFFORTS.includes(reglages.effort as never)) {
            throw new Error(`Niveau d'effort inconnu : ${reglages.effort}`);
          }
          await session.applyFlagSettings({ effortLevel: reglages.effort as never });
          patch.effort = reglages.effort;
        }
      } catch (err) {
        emitError(err);
        // On ne pousse que ce qui a réussi avant l'échec : l'état ne doit jamais affirmer un
        // réglage que le SDK a refusé.
      }

      if (Object.keys(patch).length > 0) setState(patch);
    },
```

Chaque champ n'entre dans `patch` qu'après le retour de son appel. C'est ce que vérifie le test « l'état ne doit pas mentir sur un appel qui a échoué ».

Peupler les modèles disponibles à l'initialisation, dans `handleMessage`, sur `system/init` :

```ts
    if (message.type === 'system' && message.subtype === 'init') {
      setState({ sessionId: message.session_id, model: message.model ?? null });
      void session
        .supportedModels()
        .then((models) =>
          setState({ availableModels: models.map((m) => ({ value: m.value, displayName: m.displayName })) })
        )
        .catch(emitError);
      return;
    }
```

`void` et `.catch` : la liste des modèles est un agrément, jamais une raison de faire tomber l'initialisation de session.

Dans `server/index.ts`, câbler la commande déjà déclarée au protocole :

```ts
      if (cmd.type === 'runtime.set') {
        void manager.applyRuntime({
          model: cmd.model,
          effort: cmd.effort,
          permissionMode: cmd.permissionMode,
        });
      }
```

`applyRuntime` ne rejette jamais — elle capture et émet. Le `void` est donc sûr, contrairement au `void manager.interrupt()` qui avait fait tomber le serveur en tranche 1.

- [ ] **Step 6: Lancer les tests serveur**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Écrire les tests du menu, qui échouent**

Créer `client/src/components/ControlMenu.test.tsx` :

```tsx
import { test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ControlMenu } from './ControlMenu.tsx';

const options = [
  { value: 'low', label: 'low' },
  { value: 'high', label: 'high' },
];

test('la valeur courante est affichee sur le declencheur', () => {
  render(<ControlMenu label="Effort" options={options} value="high" onSelect={() => {}} />);
  expect(screen.getByRole('button', { name: /high/ })).toBeTruthy();
});

test('la liste est repliee par defaut', () => {
  render(<ControlMenu label="Effort" options={options} value="high" onSelect={() => {}} />);
  expect(screen.queryByRole('listbox')).toBeNull();
});

test('ouvrir puis choisir remonte la valeur et referme', () => {
  const choisis: string[] = [];
  render(<ControlMenu label="Effort" options={options} value="high" onSelect={(v) => choisis.push(v)} />);

  fireEvent.click(screen.getByRole('button', { name: /high/ }));
  fireEvent.click(screen.getByRole('option', { name: 'low' }));

  expect(choisis).toEqual(['low']);
  expect(screen.queryByRole('listbox')).toBeNull();
});

test('sans valeur connue, le declencheur porte le nom du reglage', () => {
  render(<ControlMenu label="Modèle" options={[]} value={null} onSelect={() => {}} />);
  expect(screen.getByRole('button', { name: /Modèle/ })).toBeTruthy();
});

test('un menu sans option ne s ouvre pas', () => {
  render(<ControlMenu label="Modèle" options={[]} value={null} onSelect={() => {}} />);
  fireEvent.click(screen.getByRole('button'));
  expect(screen.queryByRole('listbox')).toBeNull();
});

test('le mode manuel se signale, un mode permissif reste discret', () => {
  const modes = [{ value: 'default', label: 'default' }, { value: 'acceptEdits', label: 'acceptEdits' }];
  const { rerender } = render(
    <ControlMenu label="Mode" options={modes} value="default" onSelect={() => {}} tone="warn" />
  );
  expect(screen.getByRole('button').getAttribute('data-tone')).toBe('warn');

  rerender(<ControlMenu label="Mode" options={modes} value="acceptEdits" onSelect={() => {}} />);
  expect(screen.getByRole('button').getAttribute('data-tone')).toBe('neutral');
});
```

La troisième loi de mise en page — rien n'est visible en permanence sans l'avoir mérité — impose la deuxième assertion : la liste est repliée par défaut.

- [ ] **Step 8: Écrire le menu**

Créer `client/src/components/ControlMenu.tsx` :

```tsx
import { useState } from 'react';

export type ControlOption = { value: string; label: string };

export function ControlMenu({
  label,
  options,
  value,
  onSelect,
  tone,
}: {
  label: string;
  options: ControlOption[];
  value: string | null;
  onSelect: (value: string) => void;
  tone?: 'neutral' | 'warn' | 'accent';
}) {
  const [ouvert, setOuvert] = useState(false);
  const courant = options.find((o) => o.value === value);

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="pill"
        data-tone={tone ?? 'neutral'}
        aria-haspopup="listbox"
        aria-expanded={ouvert}
        onClick={() => options.length > 0 && setOuvert((o) => !o)}
      >
        {courant?.label ?? value ?? label}
        <span style={{ opacity: 0.5 }}>▾</span>
      </button>

      {ouvert && (
        <ul
          role="listbox"
          aria-label={label}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 10,
            listStyle: 'none',
            margin: 0,
            padding: 4,
            minWidth: '100%',
            background: 'var(--surface-raised)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-panel)',
          }}
        >
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  setOuvert(false);
                  onSelect(option.value);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '4px 8px',
                  border: 'none',
                  borderRadius: 'var(--radius-control)',
                  background: option.value === value ? 'var(--accent-soft)' : 'transparent',
                  color: 'var(--text)',
                  font: 'inherit',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 9: Remplacer `PLACEHOLDER_CONTROLS`**

`TopBar` ne reçoit plus des `ControlPill` inertes mais des enfants :

```tsx
export function TopBar({ children, onOpenSettings }: { children?: ReactNode; onOpenSettings?: () => void }) {
```

Supprimer le type `ControlPill` et la boucle qui le rendait. Le composant redevient ce qu'il aurait dû être : une barre qui dispose, pas qui décide.

Corriger `gap: 7` en `gap: 8` pendant qu'on y est — mineur §3.5, l'échelle du design system est `4 / 6 / 8 / 10 / 12 / 16 / 20 / 24`.

Dans `client/src/screens/Session.tsx` :

```tsx
const MODES = ['default', 'acceptEdits', 'plan', 'dontAsk', 'auto'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

const set = (reglage: 'model' | 'effort' | 'permissionMode') => (value: string) =>
  connection.current?.send({ type: 'runtime.set', [reglage]: value });
```

```tsx
<TopBar onOpenSettings={() => setScreen('settings')}>
  <ControlMenu
    label="Modèle"
    options={state.availableModels.map((m) => ({ value: m.value, label: m.displayName }))}
    value={state.model}
    onSelect={set('model')}
  />
  <ControlMenu
    label="Effort"
    options={EFFORTS.map((e) => ({ value: e, label: e }))}
    value={state.effort}
    onSelect={set('effort')}
  />
  <ControlMenu
    label="Mode"
    options={MODES.map((m) => ({ value: m, label: m }))}
    value={state.permissionMode}
    onSelect={set('permissionMode')}
    tone={state.permissionMode === 'default' ? 'warn' : 'neutral'}
  />
</TopBar>
```

Le ton `warn` sur `default` applique la règle de `docs/ui-spec.md` : « un mode permissif reste discret, un mode manuel se signale, parce qu'il implique que la session peut s'arrêter en attente. »

`AppState` doit désormais porter `model`, `effort`, `permissionMode` et `availableModels`, alimentés par `session.state`. Ajouter les tests correspondants à `state.test.ts` : un `session.state` met à jour les quatre.

- [ ] **Step 10: Vérifier qu'il ne reste plus de placeholder de contrôle**

```bash
grep -rn PLACEHOLDER client/src
```

Attendu : seul `PLACEHOLDER_FOOTER` subsiste. Le pied de page est câblé en tranche 3.

- [ ] **Step 11: Lancer toute la suite**

Run: `npm test && npm run test:client && npm run typecheck && npm run build`
Expected: tout vert

- [ ] **Step 12: Commit**

```bash
git add server/protocol.ts server/session/manager.ts server/session/manager.test.ts server/index.ts client/src/state.ts client/src/state.test.ts client/src/components/ControlMenu.tsx client/src/components/ControlMenu.test.tsx client/src/components/TopBar.tsx client/src/screens/Session.tsx
git commit -m "feat: modele effort et mode de permission changeables en cours de session"
```
