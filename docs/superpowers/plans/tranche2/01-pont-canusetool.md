# Feature 01 — Le pont `canUseTool`

Objectif : une demande de permission suspend l'agent, atteint le client, et la réponse la débloque.

C'est la feature porteuse de la tranche. Tout le reste en dépend.

Toutes les signatures citées ici viennent de [`docs/environnement.md`](../../../environnement.md), extrait de `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`. Aucune n'est écrite de mémoire.

## Ce qu'il faut savoir avant d'écrire une ligne

**`canUseTool` prend deux arguments positionnels puis un objet d'options** — pas trois positionnels, pas un seul objet :

```ts
(toolName: string, input: Record<string, unknown>, options: {...}) => Promise<PermissionResult | null>
```

**Le `null` est un piège documenté par le SDK lui-même** (`sdk.d.ts:205-211`) :

> Return `null` ONLY after the consumer has already sent the control_response out-of-band […] Fail-closed: an accidental null means no control_response is sent and the tool stays blocked indefinitely — permission prompts have no park deadline.

La parade retenue n'est pas une consigne mais une annotation : la fonction du pont est déclarée `Promise<PermissionResult>`, **sans `| null`**. Elle satisfait `CanUseTool` par covariance du type de retour, et le compilateur refuse `null` au point de définition. C'est la moitié de cette feature.

**`PermissionResult` n'a que deux variantes** (`sdk.d.ts:2389-2401`), discriminées par `behavior: 'allow' | 'deny'`. Il n'y a pas de `'ask'` ici — `PermissionBehavior`, qui vaut `allow | deny | ask`, est un type différent, celui des règles.

**`PermissionRequest` du protocole est faux et doit être révisé ici.** Écrit en tranche 1 sans vérification, il porte `canAlwaysAllow` qui n'existe nulle part dans le SDK, nomme `toolUseId` ce que le SDK nomme `toolUseID`, et ignore trois champs que les contraintes globales de la tranche exigent.

**Ce qui ne traverse pas le protocole :** `options.suggestions`. C'est un `PermissionUpdate[]`, une union SDK à six variantes ; le client n'en ferait rien d'autre que le renvoyer. Le serveur les garde dans la map des demandes en attente et les ressort lui-même sur une décision `'always'`.

**Files:**
- Modify: `server/protocol.ts`
- Create: `server/session/permissions.ts`
- Create: `server/session/permissions.test.ts`
- Modify: `server/session/manager.ts`
- Modify: `server/session/manager.test.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Consomme : `createSessionManager` de T1-03, le type `ServerEvent` du protocole.
- Produit :
  - `createPermissionBridge({emit}): PermissionBridge` avec `bridge.canUseTool` (à passer à `query()`), `bridge.respond(requestId, decision, reason?)`, `bridge.pending(): PermissionRequest[]`.
  - `SessionManager.control(): Query` — l'accesseur à l'objet du SDK, utilisé par les features 06 et suivantes.

---

- [ ] **Step 1: Réviser `PermissionRequest` dans `server/protocol.ts`**

Remplacer le type existant (lignes 32-41) par :

```ts
export type PermissionRequest = {
  requestId: string;
  /** Vient de `options.toolUseID` du SDK — casse différente, volontaire : tout le protocole est en camelCase. */
  toolUseId: string;
  toolName: string;
  title?: string;
  displayName?: string;
  description?: string;
  input: Record<string, unknown>;
  /**
   * Dérivé : `!options.suppressAlwaysAllowRule`. Le SDK expose l'inverse ; l'inversion est faite
   * une fois ici plutôt que dans chaque composant qui lira le champ.
   */
  canAlwaysAllow: boolean;
  /**
   * Vrai quand le SDK interdit qu'une frappe parasite approuve la demande : pas de raccourci
   * d'approbation à une touche, et le focus va sur le refus.
   */
  defaultToNo: boolean;
  /** Présent pour les outils `mcp__*`. `name` est du texte non fiable : ne jamais l'insérer en HTML brut. */
  mcpServer?: { name: string; source: string };
};
```

Ajouter au-dessus de `ClientCommand`, sur la ligne `permission.respond` :

```ts
  /**
   * `'always'` n'existe dans aucune énumération du SDK : c'est un concept d'interface propre au
   * dashboard, traduit côté serveur en `{behavior: 'allow', updatedPermissions: suggestions}`.
   * Ne pas le chercher dans `PermissionBehavior` ni dans `PermissionResult`.
   */
```

- [ ] **Step 2: Écrire les tests du pont, qui échouent**

Créer `server/session/permissions.test.ts` :

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPermissionBridge } from './permissions.ts';
import type { ServerEvent } from '../protocol.ts';

const options = (over: Record<string, unknown> = {}) =>
  ({ signal: new AbortController().signal, requestId: 'r1', toolUseID: 'tu1', ...over }) as never;

test('une demande suspend jusqu a la reponse et emet la requete', async () => {
  const events: ServerEvent[] = [];
  const bridge = createPermissionBridge({ emit: (e) => events.push(e) });

  let resolved = false;
  const decision = bridge
    .canUseTool('Bash', { command: 'ls' }, options({ title: 'Claude veut lister' }))
    .then((r) => {
      resolved = true;
      return r;
    });

  await new Promise((r) => setTimeout(r, 10));
  assert.equal(resolved, false, 'la promesse ne doit pas se resoudre avant la decision');

  const emitted = events.find((e) => e.type === 'permission.request');
  assert.ok(emitted && emitted.type === 'permission.request');
  assert.equal(emitted.request.requestId, 'r1');
  assert.equal(emitted.request.toolUseId, 'tu1');
  assert.equal(emitted.request.toolName, 'Bash');
  assert.equal(emitted.request.title, 'Claude veut lister');
  assert.deepEqual(emitted.request.input, { command: 'ls' });

  bridge.respond('r1', 'allow');
  assert.deepEqual(await decision, { behavior: 'allow' });
});

test('canAlwaysAllow est l inverse de suppressAlwaysAllowRule', async () => {
  const events: ServerEvent[] = [];
  const bridge = createPermissionBridge({ emit: (e) => events.push(e) });

  void bridge.canUseTool('Read', {}, options({ requestId: 'a', suppressAlwaysAllowRule: true }));
  void bridge.canUseTool('Read', {}, options({ requestId: 'b', suppressAlwaysAllowRule: false }));
  void bridge.canUseTool('Read', {}, options({ requestId: 'c' }));

  const requests = events.filter((e) => e.type === 'permission.request');
  assert.deepEqual(
    requests.map((e) => (e.type === 'permission.request' ? e.request.canAlwaysAllow : null)),
    [false, true, true],
    'absent vaut faux cote SDK, donc le bouton reste autorise'
  );

  bridge.respond('a', 'deny');
  bridge.respond('b', 'deny');
  bridge.respond('c', 'deny');
});

test('un refus porte la raison dans message', async () => {
  const bridge = createPermissionBridge({ emit: () => {} });
  const decision = bridge.canUseTool('Bash', { command: 'rm -rf /' }, options());
  bridge.respond('r1', 'deny', 'trop dangereux');
  assert.deepEqual(await decision, { behavior: 'deny', message: 'trop dangereux' });
});

test('un refus sans raison porte quand meme un message non vide', async () => {
  const bridge = createPermissionBridge({ emit: () => {} });
  const decision = bridge.canUseTool('Bash', {}, options());
  bridge.respond('r1', 'deny');
  const result = await decision;
  assert.equal(result.behavior, 'deny');
  assert.ok(result.behavior === 'deny' && result.message.length > 0);
});

test('always renvoie les suggestions du SDK telles quelles', async () => {
  const bridge = createPermissionBridge({ emit: () => {} });
  const suggestions = [
    { type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'session' },
  ];
  const decision = bridge.canUseTool('Bash', {}, options({ suggestions }));
  bridge.respond('r1', 'always');

  const result = await decision;
  assert.equal(result.behavior, 'allow');
  assert.equal(
    result.behavior === 'allow' ? result.updatedPermissions : null,
    suggestions,
    'le tableau doit etre repasse tel quel, pas reconstruit champ par champ'
  );
});

test('la decision emet permission.resolved et vide l attente', async () => {
  const events: ServerEvent[] = [];
  const bridge = createPermissionBridge({ emit: (e) => events.push(e) });

  const decision = bridge.canUseTool('Read', {}, options());
  assert.equal(bridge.pending().length, 1);

  bridge.respond('r1', 'allow');
  await decision;

  assert.equal(bridge.pending().length, 0);
  const resolved = events.find((e) => e.type === 'permission.resolved');
  assert.ok(resolved && resolved.type === 'permission.resolved');
  assert.equal(resolved.requestId, 'r1');
  assert.equal(resolved.decision, 'allow');
});

test('une reponse a un identifiant inconnu ne casse rien', () => {
  const bridge = createPermissionBridge({ emit: () => {} });
  assert.doesNotThrow(() => bridge.respond('jamais-vu', 'allow'));
});

test('deux demandes simultanees se resolvent chacune de son cote', async () => {
  const bridge = createPermissionBridge({ emit: () => {} });
  const first = bridge.canUseTool('Read', {}, options({ requestId: 'r1' }));
  const second = bridge.canUseTool('Bash', {}, options({ requestId: 'r2' }));

  assert.equal(bridge.pending().length, 2);

  bridge.respond('r2', 'deny', 'non');
  assert.deepEqual(await second, { behavior: 'deny', message: 'non' });
  assert.equal(bridge.pending().length, 1);

  bridge.respond('r1', 'allow');
  assert.deepEqual(await first, { behavior: 'allow' });
});

test('l abandon cote SDK refuse la demande au lieu de la laisser pendre', async () => {
  const controller = new AbortController();
  const bridge = createPermissionBridge({ emit: () => {} });
  const decision = bridge.canUseTool('Read', {}, options({ signal: controller.signal }));

  controller.abort();
  const result = await decision;
  assert.equal(result.behavior, 'deny', 'un abandon ne doit jamais rendre null ni rester suspendu');
  assert.equal(bridge.pending().length, 0);
});

test('mcpServer traverse tel quel', async () => {
  const events: ServerEvent[] = [];
  const bridge = createPermissionBridge({ emit: (e) => events.push(e) });
  const mcpServer = { name: '<img src=x>', source: 'project' };
  const decision = bridge.canUseTool('mcp__x__y', {}, options({ mcpServer }));

  const emitted = events.find((e) => e.type === 'permission.request');
  assert.ok(emitted && emitted.type === 'permission.request');
  assert.deepEqual(emitted.request.mcpServer, mcpServer);

  bridge.respond('r1', 'allow');
  await decision;
});
```

- [ ] **Step 3: Lancer pour vérifier l'échec**

Run: `npm test`
Expected: FAIL — `Cannot find module './permissions.ts'`

C'est la bonne raison d'échec : le module de production n'existe pas. Un échec de syntaxe ou d'import sans rapport n'est pas valable.

- [ ] **Step 4: Commit des tests rouges**

```bash
git add server/session/permissions.test.ts server/protocol.ts
git commit -m "test: le pont de permission, tests en echec"
```

- [ ] **Step 5: Écrire le pont**

Créer `server/session/permissions.ts` :

```ts
import type { CanUseTool, PermissionResult, PermissionUpdate } from '@anthropic-ai/claude-agent-sdk';
import type { PermissionRequest, ServerEvent } from '../protocol.ts';

export type PermissionDecision = 'allow' | 'always' | 'deny';

export type PermissionBridge = {
  canUseTool: CanUseTool;
  respond(requestId: string, decision: PermissionDecision, reason?: string): void;
  pending(): PermissionRequest[];
};

type Waiting = {
  request: PermissionRequest;
  suggestions: PermissionUpdate[];
  settle: (result: PermissionResult) => void;
};

export function createPermissionBridge(opts: { emit: (event: ServerEvent) => void }): PermissionBridge {
  const waiting = new Map<string, Waiting>();

  // Le type de retour est volontairement `Promise<PermissionResult>` et non
  // `Promise<PermissionResult | null>` comme le déclare `CanUseTool`. La covariance du retour
  // rend l'affectation valide, et le compilateur refuse désormais `null` ici — un `null` accidentel
  // laisserait l'outil bloqué indéfiniment (sdk.d.ts:205-211).
  const canUseTool = (
    toolName: string,
    input: Record<string, unknown>,
    options: Parameters<CanUseTool>[2]
  ): Promise<PermissionResult> =>
    new Promise<PermissionResult>((resolve) => {
      const request: PermissionRequest = {
        requestId: options.requestId,
        toolUseId: options.toolUseID,
        toolName,
        title: options.title,
        displayName: options.displayName,
        description: options.description,
        input,
        canAlwaysAllow: !options.suppressAlwaysAllowRule,
        defaultToNo: options.defaultToNo === true,
        mcpServer: options.mcpServer,
      };

      const settle = (result: PermissionResult) => {
        if (!waiting.delete(options.requestId)) return;
        resolve(result);
      };

      waiting.set(options.requestId, {
        request,
        suggestions: options.suggestions ?? [],
        settle,
      });

      // Un abandon côté SDK doit refuser, jamais laisser la promesse suspendue.
      options.signal.addEventListener(
        'abort',
        () => settle({ behavior: 'deny', message: 'Demande abandonnée.' }),
        { once: true }
      );

      opts.emit({ type: 'permission.request', request });
    });

  return {
    canUseTool,

    respond(requestId, decision, reason) {
      const entry = waiting.get(requestId);
      if (!entry) return;

      if (decision === 'deny') {
        entry.settle({ behavior: 'deny', message: reason ?? 'Refusé depuis le dashboard.' });
      } else if (decision === 'always') {
        entry.settle({ behavior: 'allow', updatedPermissions: entry.suggestions });
      } else {
        entry.settle({ behavior: 'allow' });
      }

      opts.emit({ type: 'permission.resolved', requestId, decision });
    },

    pending: () => [...waiting.values()].map((entry) => entry.request),
  };
}
```

Deux points à ne pas simplifier :

`settle` passe par `waiting.delete()` avant de résoudre, et sort si l'entrée n'existait plus. C'est ce qui rend l'abandon et la réponse mutuellement exclusifs sans course.

`respond` émet `permission.resolved` même sur une décision déjà tranchée par un abandon ? Non : `entry` est absent dans ce cas et la fonction sort avant. C'est le test « une réponse à un identifiant inconnu ne casse rien » qui le vérifie.

- [ ] **Step 6: Lancer pour vérifier que ça passe**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Écrire le test du branchement au gestionnaire, qui échoue**

Ajouter à `server/session/manager.test.ts` :

```ts
test('le gestionnaire passe canUseTool au SDK et expose control', async () => {
  let received: unknown = undefined;
  const { query } = fakeQuery(() => []);

  const spy = ((args: { options?: { canUseTool?: unknown } }) => {
    received = args.options?.canUseTool;
    return query(args as never);
  }) as never;

  const manager = createSessionManager({ cwd: '/tmp', emit: () => {}, queryFn: spy });

  assert.equal(typeof received, 'function', 'canUseTool doit etre passe a query()');
  assert.equal(typeof manager.control().interrupt, 'function', 'control() rend l objet Query');

  await manager.stop();
});

test('le gestionnaire expose les demandes en attente', async () => {
  const { query } = fakeQuery(() => []);
  const manager = createSessionManager({ cwd: '/tmp', emit: () => {}, queryFn: query });

  assert.deepEqual(manager.pendingPermissions(), []);
  await manager.stop();
});
```

- [ ] **Step 8: Lancer pour vérifier l'échec**

Run: `npm test`
Expected: FAIL — `manager.control is not a function`

- [ ] **Step 9: Brancher le pont dans le gestionnaire**

Dans `server/session/manager.ts`, importer le pont et son type :

```ts
import { createPermissionBridge, type PermissionDecision } from './permissions.ts';
```

Étendre le type exporté :

```ts
export type SessionManager = {
  send(text: string): void;
  interrupt(): Promise<void>;
  state(): SessionState;
  stop(): Promise<void>;
  respondPermission(requestId: string, decision: PermissionDecision, reason?: string): void;
  pendingPermissions(): PermissionRequest[];
  /**
   * L'objet `Query` du SDK. Exposé en bloc plutôt qu'en huit méthodes de délégation : la tranche 2
   * en appelle quatre, la tranche 3 en appellera cinq de plus.
   */
  control(): ReturnType<QueryFn>;
};
```

Ajouter l'import de `PermissionRequest` depuis `../protocol.ts`.

Créer le pont **avant** l'appel à `queryFn`, et le passer dans les options :

```ts
  const permissions = createPermissionBridge({ emit: opts.emit });

  const session = queryFn({
    prompt: queue.stream,
    options: {
      cwd: opts.cwd,
      includePartialMessages: true,
      canUseTool: permissions.canUseTool,
    },
  });
```

Et dans l'objet retourné :

```ts
    respondPermission: (requestId, decision, reason) => {
      permissions.respond(requestId, decision, reason);
      if (permissions.pending().length === 0 && state.status === 'awaiting-permission') {
        setState({ status: 'generating' });
      }
    },

    pendingPermissions: () => permissions.pending(),

    control: () => session,
```

- [ ] **Step 10: Faire basculer le statut pendant l'attente**

`SessionState.status` a déjà `'awaiting-permission'` (`server/protocol.ts:27`), jamais employé en tranche 1.

Le pont ne connaît pas l'état de session, et le gestionnaire ne voit pas les demandes arriver. Passer un rappel au pont plutôt que de lui donner accès à `setState` :

```ts
  const permissions = createPermissionBridge({
    emit: opts.emit,
    onPendingChange: (count) => {
      if (count > 0) setState({ status: 'awaiting-permission' });
      else if (state.status === 'awaiting-permission') setState({ status: 'generating' });
    },
  });
```

Dans `permissions.ts`, ajouter le champ optionnel aux options et l'appeler après chaque `waiting.set` et chaque `settle` réussi :

```ts
export function createPermissionBridge(opts: {
  emit: (event: ServerEvent) => void;
  onPendingChange?: (count: number) => void;
}): PermissionBridge {
```

Le `respondPermission` du step 9 devient alors redondant sur la partie statut — supprimer la bascule qu'il porte et laisser `onPendingChange` seul responsable. Un seul endroit décide du statut.

Ajouter le test correspondant dans `permissions.test.ts` :

```ts
test('onPendingChange suit le nombre de demandes en attente', async () => {
  const counts: number[] = [];
  const bridge = createPermissionBridge({ emit: () => {}, onPendingChange: (n) => counts.push(n) });

  const first = bridge.canUseTool('Read', {}, options({ requestId: 'r1' }));
  const second = bridge.canUseTool('Bash', {}, options({ requestId: 'r2' }));
  bridge.respond('r1', 'allow');
  bridge.respond('r2', 'allow');
  await Promise.all([first, second]);

  assert.deepEqual(counts, [1, 2, 1, 0]);
});
```

- [ ] **Step 11: Lancer les tests serveur**

Run: `npm test`
Expected: PASS

- [ ] **Step 12: Câbler la commande dans `server/index.ts`**

Dans le bloc `onCommand`, ajouter :

```ts
      if (cmd.type === 'permission.respond') {
        manager.respondPermission(cmd.requestId, cmd.decision, cmd.reason);
      }
```

Dans `onConnect`, rejouer les demandes en attente — sans cela, un rafraîchissement de page laisserait la promesse de `canUseTool` suspendue côté serveur sans plus aucune interface pour y répondre :

```ts
    onConnect: (send) => {
      if (!manager) return;
      send({ type: 'session.state', state: manager.state() });
      for (const request of manager.pendingPermissions()) {
        send({ type: 'permission.request', request });
      }
    },
```

- [ ] **Step 13: Corriger le garde d'entrée du serveur**

Mineur §3.6 de la revue finale de la tranche 1, intercalé ici puisque cette feature touche déjà le fichier.

`server/index.ts:68` porte `process.argv[1]?.endsWith('index.ts')`. Après `npm run build`, l'artefact s'appelle `dist/server/index.js` : le garde est faux et le serveur compilé ne démarre jamais. Remplacer par :

```ts
const isEntrypoint = /[\\/]index\.(ts|js)$/.test(process.argv[1] ?? '');
```

Vérifier :

```bash
npm run build && node dist/server/index.js --help 2>&1 | head -3
```

Le serveur doit démarrer et afficher sa ligne `server listening on…`, puis être arrêté par Ctrl+C.

- [ ] **Step 14: Lancer toute la suite**

Run: `npm test && npm run test:client && npm run typecheck && npm run build`
Expected: tout vert

- [ ] **Step 15: Commit**

```bash
git add server/protocol.ts server/session/permissions.ts server/session/permissions.test.ts server/session/manager.ts server/session/manager.test.ts server/index.ts
git commit -m "feat: pont canUseTool, une demande suspend l agent et atteint le client"
```
