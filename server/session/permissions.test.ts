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

test('always renvoie une regle allow forcee sur la session, pas la destination suggeree par le SDK', async () => {
  const bridge = createPermissionBridge({ emit: () => {} });
  const suggestions = [
    { type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'userSettings' },
  ];
  const decision = bridge.canUseTool('Bash', {}, options({ suggestions }));
  bridge.respond('r1', 'always');

  const result = await decision;
  assert.equal(result.behavior, 'allow');
  assert.deepEqual(
    result.behavior === 'allow' ? result.updatedPermissions : null,
    [{ type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'session' }],
    "le dashboard tient deja sa propre persistance ; ecrire dans userSettings/localSettings/projectSettings au nom d un bouton qui ne promet que la session courante serait plus large que ce que l utilisateur a vu"
  );
});

test('always ne renvoie jamais un setMode ou un addDirectories qu un bouton "toujours pour cet outil" ne promet pas', async () => {
  const bridge = createPermissionBridge({ emit: () => {} });
  const suggestions = [
    { type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'session' },
    { type: 'setMode', mode: 'acceptEdits', destination: 'session' },
    { type: 'addDirectories', directories: ['/etc'], destination: 'session' },
  ];
  const decision = bridge.canUseTool('Bash', {}, options({ suggestions }));
  bridge.respond('r1', 'always');

  const result = await decision;
  assert.equal(result.behavior, 'allow');
  const updated = result.behavior === 'allow' ? result.updatedPermissions : [];
  assert.equal(updated?.length, 1, 'setMode et addDirectories elargiraient la session au-dela de ce que le bouton annonce');
  assert.equal(updated?.[0]?.type, 'addRules');
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

test('l abandon cote SDK emet permission.resolved, sinon le rappel reste bloque cote client', async () => {
  const controller = new AbortController();
  const events: ServerEvent[] = [];
  const bridge = createPermissionBridge({ emit: (e) => events.push(e) });
  const decision = bridge.canUseTool('Read', {}, options({ signal: controller.signal }));

  controller.abort();
  await decision;

  const resolved = events.find((e) => e.type === 'permission.resolved');
  assert.ok(resolved && resolved.type === 'permission.resolved', 'sans cet evenement, ApprovalBlock et PendingApprovalBar restent actionnables indefiniment');
  assert.equal(resolved.requestId, 'r1');
  assert.equal(resolved.decision, 'deny');
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

test('permission.resolved part avant le changement de statut', async () => {
  const ordre: string[] = [];
  const bridge = createPermissionBridge({
    emit: (e) => ordre.push(e.type),
    onPendingChange: (n) => ordre.push(`pending:${n}`),
  });

  const decision = bridge.canUseTool('Bash', {}, options());
  bridge.respond('r1', 'allow');
  await decision;

  // L'ordre exact compte : si `pending:0` partait en premier, le client afficherait l'indicateur
  // de generation alors que le rappel d'approbation est encore affiche — deux role="status"
  // simultanes, et un rappel qui survit a une decision deja prise.
  //
  // A l'ouverture, le statut bascule AVANT la requete : l'indicateur de generation disparait,
  // puis le rappel apparait. L'ordre inverse les ferait coexister.
  assert.deepEqual(ordre, ['pending:1', 'permission.request', 'permission.resolved', 'pending:0']);
});

// `timeout` explicite : ce test attend une promesse que SEUL le court-circuit peut resoudre. Sans
// lui, tant que la fonctionnalite n'existe pas, il ne echoue pas — il pend, et bloque toute la
// suite. Un test rouge doit echouer vite. Le garde reste utile ensuite : si une regression casse
// le court-circuit, la suite echoue en deux secondes au lieu de rester suspendue.
test('un outil deja accorde ne declenche aucune demande', { timeout: 2000 }, async () => {
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

test('un outil deja accorde redemande quand meme si suppressAlwaysAllowRule', { timeout: 2000 }, async () => {
  const events: ServerEvent[] = [];
  const bridge = createPermissionBridge({
    emit: (e) => events.push(e),
    isGranted: (toolName) => toolName === 'Write',
  });

  const decision = bridge.canUseTool('Write', {}, options({ suppressAlwaysAllowRule: true }));
  assert.equal(
    events.filter((e) => e.type === 'permission.request').length,
    1,
    'le SDK dit qu une regle large depasserait cette action precise ; le court-circuit ne doit pas passer outre'
  );

  bridge.respond('r1', 'allow');
  await decision;
});

test('un outil deja accorde redemande quand meme si matchedAskRule', { timeout: 2000 }, async () => {
  const events: ServerEvent[] = [];
  const bridge = createPermissionBridge({
    emit: (e) => events.push(e),
    isGranted: (toolName) => toolName === 'Bash',
  });

  const decision = bridge.canUseTool(
    'Bash',
    {},
    options({ matchedAskRule: { source: 'project', toolName: 'Bash', ruleContent: 'git push:*' } })
  );
  assert.equal(
    events.filter((e) => e.type === 'permission.request').length,
    1,
    'une regle ask explicitement posee par l utilisateur exprime une intention humaine ; le court-circuit ne doit pas la court-circuiter'
  );

  bridge.respond('r1', 'allow');
  await decision;
});

test('un outil deja accorde redemande quand meme si defaultToNo', { timeout: 2000 }, async () => {
  const events: ServerEvent[] = [];
  const bridge = createPermissionBridge({
    emit: (e) => events.push(e),
    isGranted: (toolName) => toolName === 'Read',
  });

  const decision = bridge.canUseTool('Read', {}, options({ defaultToNo: true }));
  assert.equal(events.filter((e) => e.type === 'permission.request').length, 1);

  bridge.respond('r1', 'allow');
  await decision;
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

test('une suggestion restreinte n autorise pas le bouton toujours', async () => {
  const events: ServerEvent[] = [];
  const bridge = createPermissionBridge({ emit: (e) => events.push(e) });

  const decision = bridge.canUseTool('Bash', {}, options({
    suggestions: [{
      type: 'addRules',
      rules: [{ toolName: 'Bash', ruleContent: 'npm test:*' }],
      behavior: 'allow',
      destination: 'session',
    }],
  }));

  const emis = events.find((e) => e.type === 'permission.request');
  assert.ok(emis && emis.type === 'permission.request');
  assert.equal(
    emis.request.canAlwaysAllow,
    false,
    'le SDK ne propose que Bash(npm test:*) ; enregistrer Bash entier accorderait plus que ce que l utilisateur a vu'
  );

  bridge.respond('r1', 'allow');
  await decision;
});

test('une suggestion sur l outil entier autorise le bouton toujours', async () => {
  const events: ServerEvent[] = [];
  const bridge = createPermissionBridge({ emit: (e) => events.push(e) });

  const decision = bridge.canUseTool('Bash', {}, options({
    suggestions: [{
      type: 'addRules',
      rules: [{ toolName: 'Bash' }],
      behavior: 'allow',
      destination: 'session',
    }],
  }));

  const emis = events.find((e) => e.type === 'permission.request');
  assert.ok(emis && emis.type === 'permission.request');
  assert.equal(emis.request.canAlwaysAllow, true);

  bridge.respond('r1', 'allow');
  await decision;
});

test('always sur une portee restreinte n enregistre rien, meme si la commande arrive', async () => {
  const accordes: string[] = [];
  const bridge = createPermissionBridge({
    emit: () => {},
    onGrant: (toolName) => accordes.push(toolName),
  });

  const decision = bridge.canUseTool('Bash', {}, options({
    suggestions: [{
      type: 'addRules',
      rules: [{ toolName: 'Bash', ruleContent: 'npm test:*' }],
      behavior: 'allow',
      destination: 'session',
    }],
  }));

  // Le bouton est masque cote interface, mais un client malveillant ou bogue peut envoyer la
  // commande quand meme. Une decision de portee ne se delegue pas au client.
  bridge.respond('r1', 'always');
  const resultat = await decision;

  assert.deepEqual(accordes, [], 'aucune persistance sur une portee qu on ne sait pas reproduire');
  assert.equal(resultat.behavior, 'allow');
  assert.equal(
    resultat.behavior === 'allow' ? resultat.updatedPermissions?.length : null,
    1,
    'la regle etroite part quand meme au SDK, qui sait l appliquer pour la session'
  );
});

test('une suggestion deny ne vaut pas accord sur l outil entier', async () => {
  const events: ServerEvent[] = [];
  const bridge = createPermissionBridge({ emit: (e) => events.push(e) });

  const decision = bridge.canUseTool('Bash', {}, options({
    suggestions: [{
      type: 'addRules',
      rules: [{ toolName: 'Bash' }],
      behavior: 'deny',
      destination: 'session',
    }],
  }));

  const emis = events.find((e) => e.type === 'permission.request');
  assert.ok(emis && emis.type === 'permission.request');
  assert.equal(emis.request.canAlwaysAllow, false);

  bridge.respond('r1', 'deny');
  await decision;
});
