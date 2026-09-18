# Feature 07 — Couture

**Mandat explicite : tester ce qu'aucune autre feature ne teste.**

Chaque feature de cette tranche est vérifiée contre des doubles. Le pont contre un faux objet d'options. Le réducteur contre des `ServerEvent` écrits à la main. Les composants contre des entrées fabriquées. **Personne n'a mandat pour vérifier la jonction.**

C'est exactement ce qui a laissé passer les deux défauts critiques de la tranche 1 : chaque feature était parfaitement conforme à sa propre spécification, et le défaut vivait entre elles. La revue finale l'a nommé (`§2.9`) : « aucun test ne fait transiter un événement réellement produit par le gestionnaire jusqu'à `reduceEvent`. Les deux côtés sont testés contre des littéraux écrits à la main, jamais l'un contre l'autre. »

Cette feature répare cette classe de bug pour la tranche 2, et pose le test que la tranche 1 aurait dû avoir.

## La règle qui donne sa valeur au test

**Aucun double de protocole entre les deux bouts.** Pas d'objet `ServerEvent` écrit à la main dans ce fichier. Pas de `PermissionRequest` fabriqué. Si le test doit construire un événement lui-même, il a cessé de tester la couture.

Ce qui a le droit d'être faux : le `query` du SDK, parce qu'appeler le vrai consomme des crédits et rend le test non déterministe. Tout le reste — le pont, le gestionnaire, le serveur WebSocket, le transport client, le réducteur — est le vrai code.

**Files:**
- Create: `server/couture.test.ts`
- Modify: `client/src/test-doubles.ts` — si un double manque, il s'ajoute là et nulle part ailleurs

**Interfaces:**
- Consomme : tout. C'est le propos.
- Produit : rien de nouveau. Aucune ligne de code de production n'est écrite par cette feature, sauf si elle trouve un défaut.

---

- [ ] **Step 1: Écrire le test de bout en bout**

Créer `server/couture.test.ts`. Ce test importe le réducteur du client depuis le serveur : c'est volontaire et c'est tout l'intérêt — un seul processus, les deux bouts, un vrai socket entre les deux.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createServer } from './index.ts';
import { createSessionManager } from './session/manager.ts';
import { reduceEvent, initialState, type AppState } from '../client/src/state.ts';
import { parseClientCommand, type ServerEvent } from './protocol.ts';

/**
 * Le seul double autorisé ici : le `query` du SDK. Il déclenche `canUseTool` avec des arguments
 * de la forme réelle relevée dans docs/environnement.md — deux positionnels puis un objet
 * d'options — puis rend une réponse selon la décision reçue.
 */
function queryQuiDemandeUnePermission() {
  let declencher: ((options: Record<string, unknown>) => Promise<unknown>) | null = null;

  const query = ({ prompt, options }: { prompt: unknown; options: Record<string, unknown> }) => {
    const canUseTool = options.canUseTool as (
      toolName: string,
      input: Record<string, unknown>,
      opts: Record<string, unknown>
    ) => Promise<{ behavior: string; message?: string }>;

    declencher = (opts) => canUseTool('Bash', { command: 'ls -la' }, opts);

    const generator = (async function* () {
      for await (const _ of prompt as AsyncIterable<unknown>) {
        yield {
          type: 'assistant',
          message: { id: 'msg_1', content: [{ type: 'text', text: 'fait' }] },
          uuid: 'm1',
          session_id: 's1',
        };
        yield { type: 'result', subtype: 'success', total_cost_usd: 0.01, session_id: 's1', uuid: 'r1' };
      }
    })();

    return Object.assign(generator, {
      interrupt: async () => undefined,
      setModel: async () => {},
      setPermissionMode: async () => {},
      applyFlagSettings: async () => {},
      supportedModels: async () => [],
    });
  };

  return { query, trigger: () => declencher };
}

test('une permission traverse le systeme entier et revient', async () => {
  const { query, trigger } = queryQuiDemandeUnePermission();

  // 1. Un vrai serveur, un vrai gestionnaire, un vrai pont.
  let manager: ReturnType<typeof createSessionManager> | null = null;

  const server = await createServer(0, {
    onConnect: (send) => {
      if (manager) send({ type: 'session.state', state: manager.state() });
    },
    onCommand: (cmd) => {
      if (!manager) return;
      if (cmd.type === 'permission.respond') {
        manager.respondPermission(cmd.requestId, cmd.decision, cmd.reason);
      }
    },
  });

  manager = createSessionManager({
    cwd: process.cwd(),
    emit: (event) => server.broadcast(event),
    queryFn: query as never,
  });

  // 2. Un vrai client WebSocket, dont les messages passent par le vrai réducteur.
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
  let state: AppState = initialState;
  const recus: ServerEvent[] = [];

  socket.on('message', (raw) => {
    const event = JSON.parse(raw.toString()) as ServerEvent;
    recus.push(event);
    state = reduceEvent(state, event);
  });

  await new Promise((resolve) => socket.on('open', resolve));

  // 3. Le SDK déclenche canUseTool avec la forme réelle de l'objet d'options.
  const decision = trigger()!({
    signal: new AbortController().signal,
    requestId: 'req-couture',
    toolUseID: 'toolu-couture',
    title: 'Claude veut lancer ls -la',
    suggestions: [
      { type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'session' },
    ],
  });

  await new Promise((r) => setTimeout(r, 50));

  // 4. L'événement a traversé le socket et atteint l'état du client, SANS être écrit à la main.
  const approbations = state.thread.filter((e) => e.kind === 'approval');
  assert.equal(approbations.length, 1, 'la demande doit atteindre l etat du client');

  const entree = approbations[0];
  assert.ok(entree && entree.kind === 'approval');
  assert.equal(entree.request.requestId, 'req-couture');
  assert.equal(entree.request.toolUseId, 'toolu-couture', 'toolUseID -> toolUseId : la casse change en route');
  assert.equal(entree.request.toolName, 'Bash');
  assert.equal(entree.request.title, 'Claude veut lancer ls -la');
  assert.deepEqual(entree.request.input, { command: 'ls -la' });
  assert.equal(entree.request.canAlwaysAllow, true, 'derive de suppressAlwaysAllowRule absent');
  assert.equal(entree.decision, null);

  // 5. La réponse repart en sens inverse, par le protocole réel.
  const commande = { type: 'permission.respond', requestId: entree.id, decision: 'allow' };
  assert.notEqual(parseClientCommand(JSON.stringify(commande)), null, 'la commande doit passer le validateur');
  socket.send(JSON.stringify(commande));

  // 6. Le canUseTool suspendu se débloque.
  const resultat = await Promise.race([
    decision,
    new Promise((_, rejeter) => setTimeout(() => rejeter(new Error('canUseTool jamais resolu')), 2000)),
  ]);
  assert.deepEqual(resultat, { behavior: 'allow' });

  // 7. Et l'état du client porte la décision, toujours dans le fil.
  await new Promise((r) => setTimeout(r, 50));
  const apres = state.thread.filter((e) => e.kind === 'approval');
  assert.equal(apres.length, 1, 'le bloc reste dans le fil apres la decision');
  assert.equal(apres[0]?.kind === 'approval' && apres[0].decision, 'allow');

  // 8. Aucun événement n'a été perdu ni inventé.
  assert.equal(recus.filter((e) => e.type === 'permission.request').length, 1);
  assert.equal(recus.filter((e) => e.type === 'permission.resolved').length, 1);
  assert.equal(recus.filter((e) => e.type === 'error').length, 0);

  socket.close();
  await manager.stop();
  await server.close();
});

test('un refus traverse aussi, avec sa raison', async () => {
  // Même montage, décision 'deny' avec raison. Vérifie que la raison arrive jusqu'au
  // PermissionResult rendu au SDK — c'est ce que l'agent lit pour s adapter.
  // (Le corps reprend le montage ci-dessus ; le facteur commun est extrait en helper local.)
});

test('always renvoie au SDK les suggestions qu il avait fournies', async () => {
  // Même montage, décision 'always'. Vérifie que `updatedPermissions` est bien le tableau
  // d'origine et non une reconstruction — les suggestions ne traversent jamais le protocole,
  // donc seule la couture peut le vérifier.
});

test('le message de l utilisateur et le streaming traversent aussi', async () => {
  // Le test que la tranche 1 n'avait pas. Envoyer 'message.send' par le socket, vérifier que
  // l'état du client finit avec le message utilisateur ET la réponse assistant dans le fil,
  // dans cet ordre, et que les identifiants de delta et de complete coincident.
});
```

Les trois derniers tests sont décrits en prose délibérément : leur montage est identique au premier et doit être extrait en fonction locale par l'implémenteur, pas recopié quatre fois. Le contenu de leurs assertions est en revanche non négociable — il figure dans les commentaires.

Le quatrième est le rattrapage de la tranche 1 : c'est littéralement le test dont la revue finale a écrit qu'il aurait attrapé les deux critiques immédiatement.

- [ ] **Step 2: Lancer et constater**

Run: `npm test`

**Deux issues possibles, et les deux sont des résultats valables.**

Si le test passe du premier coup : la couture tient, et le test garde sa valeur de filet pour les tranches suivantes. Le dire, ne pas chercher à le rendre plus impressionnant.

Si le test échoue : vous venez de trouver un défaut qu'aucune feature ne pouvait voir. Le décrire précisément — quel champ, où il change, dans quel sens — avant de le corriger.

- [ ] **Step 3: Corriger, si le test a trouvé quelque chose**

Le correctif va dans le code de production, jamais dans le test. Si le test paraît faux, c'est un `TEST_DEFECT` — voir `PROCESS.md` : s'arrêter et le déclarer, ne pas contourner.

- [ ] **Step 4: Commit**

```bash
git add server/couture.test.ts
git commit -m "test: couture, une permission traverse le systeme entier sans double de protocole"
```

- [ ] **Step 5: Vérification de bout en bout contre le vrai SDK**

```bash
npm run verify:e2e
```

Expected: les dix critères passent, y compris les trois ajoutés par la feature 04.

C'est la seconde exécution de la tranche. La première était à mi-parcours, après la feature 04 ; celle-ci vérifie que les features 05 à 07 n'ont rien cassé entre-temps.

- [ ] **Step 6: Exécuter le critère de fin de tranche**

`docs/superpowers/plans/Tranche2.md`, section Critère de fin. Serveur et client démarrés, dans un dossier de travail réel :

1. Passer la session en mode `default` depuis la barre supérieure, demander une action qui exige une approbation.
2. Le bloc apparaît dans le fil avec le contenu exact ; le rappel apparaît au-dessus du composeur.
3. Autoriser : l'action s'exécute, le rappel disparaît, la trace reste dans le fil avec la décision.
4. Refuser avec une raison : l'agent la reçoit et s'adapte.
5. « Toujours pour cet outil » : la demande suivante pour ce même outil ne bloque plus.
6. Révoquer depuis les réglages : le blocage revient.
7. Changer de modèle en cours de session, envoyer un message, vérifier que le coût évolue.
8. Laisser une demande sans réponse : la session attend, elle ne tombe pas. Rafraîchir la page pendant l'attente : la demande réapparaît.

**Ce qu'un agent ne peut pas faire, il le dit.** Aucun agent n'a de navigateur. Les points qui exigent d'observer l'interface se signalent comme non vérifiés plutôt que d'être déclarés.

- [ ] **Step 7: Cocher le critère de fin**

Dans `docs/superpowers/plans/Tranche2.md`, marquer chaque point du critère de fin avec ce qui a réellement été observé, et par quel moyen. Un point vérifié par lecture de code se note comme tel — ce n'est pas la même chose qu'un point exécuté.
