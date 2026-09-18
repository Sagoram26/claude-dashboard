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
