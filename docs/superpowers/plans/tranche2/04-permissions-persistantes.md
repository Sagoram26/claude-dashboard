# Feature 04 — Permissions persistantes

Objectif : « Toujours pour cet outil » survit à un redémarrage, et court-circuite les demandes déjà accordées.

**Après cette feature, lancer `npm run verify:e2e`** — à mi-parcours de la tranche, pas à la fin. C'est le point exact qui aurait épargné à la tranche 1 ses deux défauts critiques.

## Ce que « toujours » veut dire ici, exactement

Le SDK a déjà un mécanisme de règles : `updatedPermissions` sur un `PermissionResult`. La feature 01 le renseigne avec `options.suggestions`, et le SDK cesse d'interroger **pour cette session**. Ce n'est pas ce que cette feature ajoute.

Ce qu'elle ajoute est la persistance **entre** sessions, plus un endroit où l'utilisateur voit et retire ce qu'il a accordé.

**Le stockage n'enregistre que le nom de l'outil.** Pas les règles du SDK, qui sont une union à six variantes dont les motifs ne sont interprétables que par le SDK lui-même. Le bouton promet « toujours pour **cet outil** » : c'est la portée que l'on enregistre, et c'est la portée que l'écran de réglages montre.

**Pourquoi c'est sûr :** le SDK met `suppressAlwaysAllowRule` à vrai précisément quand une règle sur tout l'outil accorderait plus que la demande en cours (`sdk.d.ts:266-272`). La feature 01 en dérive `canAlwaysAllow`, et la feature 02 masque le bouton dans ce cas. Quand le bouton est visible, la portée « tout l'outil » est celle que le SDK lui-même propose.

Si un jour la portée fine devient nécessaire, elle s'ajoutera comme une seconde sorte d'entrée. Enregistrer aujourd'hui des motifs qu'on ne sait pas évaluer serait afficher dans les réglages des promesses qu'on ne tiendrait pas.

**Files:**
- Create: `server/session/permission-store.ts`
- Create: `server/session/permission-store.test.ts`
- Modify: `server/session/permissions.ts`
- Modify: `server/session/permissions.test.ts`
- Modify: `server/session/manager.ts`
- Modify: `server/protocol.ts`
- Modify: `scripts/verify-e2e.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Consomme : `createPermissionBridge` de la feature 01.
- Produit :
  - `createPermissionStore(dir): PermissionStore` avec `list()`, `grant(toolName)`, `revoke(toolName)`, `isGranted(toolName)`.
  - `ServerEvent` `{type: 'permission.granted'; granted: GrantedPermission[]}`.

---

- [ ] **Step 1: Écrire les tests du stockage, qui échouent**

Créer `server/session/permission-store.test.ts` :

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPermissionStore } from './permission-store.ts';

const scratch = () => mkdtemp(join(tmpdir(), 'cd-perm-'));

test('accorder puis relire depuis le disque', async () => {
  const dir = await scratch();

  const first = await createPermissionStore(dir);
  assert.deepEqual(first.list(), []);
  await first.grant('Bash');

  const second = await createPermissionStore(dir);
  assert.deepEqual(
    second.list().map((g) => g.toolName),
    ['Bash']
  );
  assert.equal(second.isGranted('Bash'), true);
  assert.equal(second.isGranted('Edit'), false);
});

test('accorder deux fois ne cree pas de doublon', async () => {
  const dir = await scratch();
  const store = await createPermissionStore(dir);
  await store.grant('Bash');
  await store.grant('Bash');
  assert.equal(store.list().length, 1);
});

test('revoquer retire du disque', async () => {
  const dir = await scratch();
  const store = await createPermissionStore(dir);
  await store.grant('Bash');
  await store.revoke('Bash');

  const relu = await createPermissionStore(dir);
  assert.deepEqual(relu.list(), []);
});

test('revoquer ce qui n a jamais ete accorde ne casse rien', async () => {
  const dir = await scratch();
  const store = await createPermissionStore(dir);
  await assert.doesNotReject(() => store.revoke('jamais'));
});

test('le fichier est du JSON lisible et editable a la main', async () => {
  const dir = await scratch();
  const store = await createPermissionStore(dir);
  await store.grant('Read');

  const brut = await readFile(join(dir, '.claude-dashboard', 'permissions.json'), 'utf8');
  assert.match(brut, /\n/, 'le fichier doit etre indente, pas sur une ligne');
  const parse = JSON.parse(brut);
  assert.equal(parse.granted[0].toolName, 'Read');
  assert.ok(typeof parse.granted[0].grantedAt === 'string');
});

test('un fichier corrompu ne fait pas tomber le serveur', async () => {
  const dir = await scratch();
  await mkdir(join(dir, '.claude-dashboard'), { recursive: true });
  await writeFile(join(dir, '.claude-dashboard', 'permissions.json'), '{ ceci n est pas du json');

  const store = await createPermissionStore(dir);
  assert.deepEqual(store.list(), [], 'un fichier illisible repart de zero plutot que de faire tomber');
});

test('un fichier valide mais de forme inattendue repart de zero', async () => {
  const dir = await scratch();
  await mkdir(join(dir, '.claude-dashboard'), { recursive: true });
  await writeFile(join(dir, '.claude-dashboard', 'permissions.json'), '{"granted": "pas un tableau"}');

  const store = await createPermissionStore(dir);
  assert.deepEqual(store.list(), []);
});
```

Le fichier vit dans un dossier temporaire à chaque test : aucun test n'écrit dans le dépôt.

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `npm test`
Expected: FAIL — `Cannot find module './permission-store.ts'`

- [ ] **Step 3: Commit des tests rouges**

```bash
git add server/session/permission-store.test.ts
git commit -m "test: stockage des permissions persistantes, tests en echec"
```

- [ ] **Step 4: Écrire le stockage**

Créer `server/session/permission-store.ts` :

```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { GrantedPermission } from '../protocol.ts';

export type PermissionStore = {
  list(): GrantedPermission[];
  grant(toolName: string): Promise<void>;
  revoke(toolName: string): Promise<void>;
  isGranted(toolName: string): boolean;
};

const FICHIER = join('.claude-dashboard', 'permissions.json');

function parse(raw: string): GrantedPermission[] {
  const data: unknown = JSON.parse(raw);
  if (typeof data !== 'object' || data === null) return [];
  const granted = (data as { granted?: unknown }).granted;
  if (!Array.isArray(granted)) return [];
  return granted.filter(
    (entry): entry is GrantedPermission =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as GrantedPermission).toolName === 'string' &&
      typeof (entry as GrantedPermission).grantedAt === 'string'
  );
}

export async function createPermissionStore(cwd: string): Promise<PermissionStore> {
  const chemin = join(cwd, FICHIER);

  let granted: GrantedPermission[] = [];
  try {
    granted = parse(await readFile(chemin, 'utf8'));
  } catch {
    // Fichier absent, illisible ou de forme inattendue : on repart d'une liste vide.
    // Jamais bloquant — une permission oubliée se redemande, un serveur qui ne démarre pas ne se
    // rattrape pas.
    granted = [];
  }

  const ecrire = async () => {
    await mkdir(dirname(chemin), { recursive: true });
    await writeFile(chemin, `${JSON.stringify({ granted }, null, 2)}\n`, 'utf8');
  };

  return {
    list: () => [...granted],

    isGranted: (toolName) => granted.some((g) => g.toolName === toolName),

    async grant(toolName) {
      if (granted.some((g) => g.toolName === toolName)) return;
      granted = [...granted, { toolName, grantedAt: new Date().toISOString() }];
      await ecrire();
    },

    async revoke(toolName) {
      const reste = granted.filter((g) => g.toolName !== toolName);
      if (reste.length === granted.length) return;
      granted = reste;
      await ecrire();
    },
  };
}
```

- [ ] **Step 5: Ajouter le type et l'événement au protocole**

Dans `server/protocol.ts` :

```ts
export type GrantedPermission = {
  toolName: string;
  /** ISO 8601. Sert à l'affichage dans les réglages, pas à une expiration : rien n'expire. */
  grantedAt: string;
};
```

Ajouter à `ServerEvent` :

```ts
  | { type: 'permission.granted'; granted: GrantedPermission[] }
```

et à `ClientCommand` :

```ts
  | { type: 'permission.revoke'; toolName: string }
```

avec son validateur dans `COMMAND_VALIDATORS` :

```ts
  'permission.revoke': (v) => typeof v.toolName === 'string' && v.toolName.length > 0,
```

`COMMAND_VALIDATORS` est typé `Record<ClientCommand['type'], …>` : oublier ce validateur casse la compilation. C'est délibéré, et c'est ce qui rend l'ajout sûr.

Côté client, `reduceEvent` a un `switch` exhaustif avec `never` en défaut : ajouter `permission.granted` sans le traiter casse aussi la compilation. Le traiter est le travail de la feature 05 ; en attendant, l'ajouter à la liste des cas qui rendent `state` tel quel, avec le commentaire existant.

- [ ] **Step 6: Court-circuiter dans le pont**

Ajouter à `server/session/permissions.test.ts` :

```ts
test('un outil deja accorde ne declenche aucune demande', async () => {
  const events: ServerEvent[] = [];
  const bridge = createPermissionBridge({
    emit: (e) => events.push(e),
    isGranted: (toolName) => toolName === 'Read',
  });

  const result = await bridge.canUseTool('Read', {}, options());

  assert.deepEqual(result, { behavior: 'allow' });
  assert.equal(events.filter((e) => e.type === 'permission.request').length, 0);
  assert.equal(bridge.pending().length, 0);
});

test('un outil non accorde demande quand meme', async () => {
  const bridge = createPermissionBridge({ emit: () => {}, isGranted: () => false });
  const decision = bridge.canUseTool('Bash', {}, options());
  assert.equal(bridge.pending().length, 1);
  bridge.respond('r1', 'allow');
  await decision;
});

test('always enregistre l outil', async () => {
  const accordes: string[] = [];
  const bridge = createPermissionBridge({
    emit: () => {},
    isGranted: () => false,
    onGrant: (toolName) => accordes.push(toolName),
  });

  const decision = bridge.canUseTool('Bash', {}, options());
  bridge.respond('r1', 'always');
  await decision;

  assert.deepEqual(accordes, ['Bash']);
});

test('allow simple n enregistre rien', async () => {
  const accordes: string[] = [];
  const bridge = createPermissionBridge({
    emit: () => {},
    onGrant: (toolName) => accordes.push(toolName),
  });

  const decision = bridge.canUseTool('Bash', {}, options());
  bridge.respond('r1', 'allow');
  await decision;

  assert.deepEqual(accordes, []);
});
```

Puis dans `server/session/permissions.ts`, étendre les options :

```ts
export function createPermissionBridge(opts: {
  emit: (event: ServerEvent) => void;
  onPendingChange?: (count: number) => void;
  isGranted?: (toolName: string) => boolean;
  onGrant?: (toolName: string) => void;
}): PermissionBridge {
```

Le court-circuit est la **première** chose que fait `canUseTool`, avant toute création de promesse suspendue :

```ts
    if (opts.isGranted?.(toolName)) return Promise.resolve({ behavior: 'allow' });
```

Et dans `respond`, sur la branche `'always'` :

```ts
      } else if (decision === 'always') {
        opts.onGrant?.(entry.request.toolName);
        entry.settle({ behavior: 'allow', updatedPermissions: entry.suggestions });
      }
```

Les deux mécanismes coexistent sans se gêner : `updatedPermissions` fait taire le SDK pour la session en cours, le stockage fait taire notre pont pour les sessions suivantes.

- [ ] **Step 7: Brancher le stockage au gestionnaire**

`createSessionManager` devient asynchrone ? **Non.** Rendre le gestionnaire asynchrone obligerait `server/index.ts` et tous les tests à changer de forme pour un chargement de fichier.

Le stockage est chargé **avant** le gestionnaire, dans `server/index.ts`, et lui est passé :

```ts
export type SessionManagerOptions = {
  cwd: string;
  emit: (event: ServerEvent) => void;
  queryFn?: QueryFn;
  store?: PermissionStore;
};
```

Dans le gestionnaire :

```ts
  const permissions = createPermissionBridge({
    emit: opts.emit,
    onPendingChange: /* inchangé */,
    isGranted: (toolName) => opts.store?.isGranted(toolName) ?? false,
    onGrant: (toolName) => {
      void opts.store?.grant(toolName).then(() => {
        opts.emit({ type: 'permission.granted', granted: opts.store?.list() ?? [] });
      });
    },
  });
```

Ajouter aussi au type `SessionManager` :

```ts
  grantedPermissions(): GrantedPermission[];
  revokePermission(toolName: string): Promise<void>;
```

`revokePermission` appelle `store.revoke` puis émet `permission.granted` avec la liste à jour. La feature 05 s'en sert.

Le `store` est optionnel pour que les tests existants n'aient pas à le fournir : sans stockage, aucun court-circuit et aucun enregistrement, ce qui est exactement le comportement de la tranche 1.

Dans `server/index.ts` :

```ts
  const store = await createPermissionStore(process.cwd());

  manager = createSessionManager({
    cwd: process.cwd(),
    emit: (event) => server.broadcast(event),
    store,
  });
```

et dans `onConnect`, pousser l'état initial des permissions accordées :

```ts
      send({ type: 'permission.granted', granted: manager.grantedPermissions() });
```

et dans `onCommand` :

```ts
      if (cmd.type === 'permission.revoke') {
        manager.revokePermission(cmd.toolName).catch((err: unknown) => {
          server.broadcast({ type: 'error', message: err instanceof Error ? err.message : String(err) });
        });
      }
```

- [ ] **Step 8: Ignorer le fichier dans git**

Ajouter à `.gitignore` :

```
.claude-dashboard/
```

Le fichier appartient au dossier de travail de l'utilisateur, pas au dépôt du dashboard.

- [ ] **Step 9: Lancer toute la suite**

Run: `npm test && npm run test:client && npm run typecheck && npm run build`
Expected: tout vert

- [ ] **Step 10: Étendre le script de vérification de bout en bout**

Dans `scripts/verify-e2e.mjs`, ajouter au scénario une phase qui exige une approbation réelle.

Le serveur de vérification doit tourner en mode `default` pour que le SDK interroge. Ajouter au scénario, après la phase 1 :

```js
      if (e.type === 'permission.request') {
        permissionRequests.push(e.request);
        // Autoriser immédiatement : ce qu'on vérifie est que la demande arrive et que la
        // réponse débloque, pas le délai de réflexion d'un humain.
        send({ type: 'permission.respond', requestId: e.request.requestId, decision: 'allow' });
      }
      if (e.type === 'permission.resolved') permissionResolved.push(e.requestId);
```

et une phase qui la provoque — une lecture de fichier suffit et ne modifie rien :

```js
      if (phase === 4) {
        phase = 5;
        console.log('[5/5] Une demande de permission traverse-t-elle ?');
        setTimeout(() => send({ type: 'message.send', text: 'Lis le fichier package.json de ce dossier.' }), 300);
        return;
      }
```

Puis trois critères de plus :

```js
check('une demande de permission atteint le client', r.permissionRequests.length > 0,
  `${r.permissionRequests.length} demande(s)`);

const complete = r.permissionRequests.every((p) => p.requestId && p.toolUseId && p.toolName);
check('la demande porte requestId, toolUseId et toolName', complete,
  complete ? 'les trois champs sont remplis' : 'un champ a change de nom en route');

check('la reponse debloque la demande',
  r.permissionResolved.length === r.permissionRequests.length,
  `${r.permissionResolved.length} resolues sur ${r.permissionRequests.length}`);
```

Le second est celui qui compte : c'est exactement la classe de bug — un champ qui change de nom entre le SDK et le protocole — que le relevé de la feature 00 a trouvée dans `PermissionRequest`.

- [ ] **Step 11: Lancer la vérification de bout en bout**

```bash
npm run verify:e2e
```

Expected: tous les critères passent, coût affiché autour de 0,20 $.

**Si un critère échoue, s'arrêter là et le remonter.** Ne pas construire les features 05 à 07 par-dessus. C'est la règle qui manquait à la tranche 1.

- [ ] **Step 12: Commit**

```bash
git add server/session/permission-store.ts server/session/permission-store.test.ts server/session/permissions.ts server/session/permissions.test.ts server/session/manager.ts server/protocol.ts client/src/state.ts scripts/verify-e2e.mjs .gitignore
git commit -m "feat: permissions persistantes et court-circuit des outils deja accordes"
```
