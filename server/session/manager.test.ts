import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionManager } from './manager.ts';
import { createMessageQueue } from './queue.ts';
import type { ServerEvent } from '../protocol.ts';

function fakeQuery(
  scenario: (userTexts: string[]) => unknown[],
  controlMethods: Record<string, unknown> = {}
) {
  const userTexts: string[] = [];
  let seenOptions: Record<string, unknown> | undefined;
  const output = createMessageQueue<unknown>();

  const query = ({ prompt, options }: { prompt: unknown; options?: Record<string, unknown> }) => {
    seenOptions = options;
    const iterable = prompt as AsyncIterable<{ message: { content: unknown } }>;

    void (async () => {
      for await (const userMessage of iterable) {
        const content = userMessage.message.content;
        userTexts.push(typeof content === 'string' ? content : JSON.stringify(content));
        for (const event of scenario(userTexts)) output.push(event);
      }
    })();

    // Le double porte les méthodes de contrôle de l'objet `Query`, sinon `manager.control()` rend
    // un générateur nu et tout appel de contrôle échoue à l'exécution sans qu'aucun test le voie.
    return Object.assign(output.stream, { interrupt: async () => undefined, ...controlMethods });
  };

  return {
    query: query as never,
    userTexts,
    options: () => seenOptions,
    push: (m: unknown) => output.push(m),
  };
}

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

test('un message envoyé atteint le SDK et sa réponse est diffusée', async () => {
  const events: ServerEvent[] = [];
  const { query, userTexts } = fakeQuery(() => [
    {
      type: 'assistant',
      message: { id: 'msg_1', content: [{ type: 'text', text: 'bonjour' }] },
      uuid: 'm1',
      session_id: 's1',
    },
    { type: 'result', subtype: 'success', total_cost_usd: 0.01, session_id: 's1', uuid: 'r1' },
  ]);

  const manager = createSessionManager({ cwd: '/tmp', emit: (e) => events.push(e), queryFn: query });
  manager.send('salut');
  await new Promise((r) => setTimeout(r, 20));

  assert.deepEqual(userTexts, ['salut']);
  const complete = events.find((e) => e.type === 'message.complete' && e.role === 'assistant');
  assert.ok(complete && complete.type === 'message.complete');
  assert.equal(complete.text, 'bonjour');

  await manager.stop();
});

test('deux messages successifs restent dans la même session', async () => {
  const events: ServerEvent[] = [];
  const { query, userTexts } = fakeQuery((texts) => [
    {
      type: 'assistant',
      message: { id: `msg_${texts.length}`, content: [{ type: 'text', text: `reponse ${texts.length}` }] },
      uuid: `m${texts.length}`,
      session_id: 's1',
    },
    { type: 'result', subtype: 'success', total_cost_usd: 0.01, session_id: 's1', uuid: `r${texts.length}` },
  ]);

  const manager = createSessionManager({ cwd: '/tmp', emit: (e) => events.push(e), queryFn: query });

  manager.send('premier');
  await new Promise((r) => setTimeout(r, 20));
  manager.send('second');
  await new Promise((r) => setTimeout(r, 20));

  assert.deepEqual(userTexts, ['premier', 'second']);
  const completes = events.filter((e) => e.type === 'message.complete' && e.role === 'assistant');
  assert.equal(completes.length, 2);

  await manager.stop();
});

test('les appels d outils ne produisent jamais de message de conversation', async () => {
  const events: ServerEvent[] = [];
  const { query } = fakeQuery(() => [
    {
      type: 'assistant',
      message: {
        id: 'msg_1',
        content: [
          { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } },
          { type: 'text', text: 'voila' },
        ],
      },
      uuid: 'm1',
      session_id: 's1',
    },
    { type: 'result', subtype: 'success', total_cost_usd: 0.01, session_id: 's1', uuid: 'r1' },
  ]);

  const manager = createSessionManager({ cwd: '/tmp', emit: (e) => events.push(e), queryFn: query });
  manager.send('fais quelque chose');
  await new Promise((r) => setTimeout(r, 20));

  const complete = events.find((e) => e.type === 'message.complete' && e.role === 'assistant');
  assert.ok(complete && complete.type === 'message.complete');
  assert.equal(complete.text, 'voila');

  const activity = events.filter((e) => e.type === 'tool.activity');
  assert.equal(activity.length, 1);

  await manager.stop();
});

test('interrompre laisse la session utilisable', async () => {
  const events: ServerEvent[] = [];
  const interruptCalls: number[] = [];
  const userTexts: string[] = [];

  const query = ({ prompt }: { prompt: unknown }) => {
    const iterable = prompt as AsyncIterable<{ message: { content: unknown } }>;

    const generator = (async function* () {
      for await (const userMessage of iterable) {
        const content = userMessage.message.content;
        userTexts.push(typeof content === 'string' ? content : '');
        yield {
          type: 'assistant',
          message: { id: `msg_${userTexts.length}`, content: [{ type: 'text', text: `vu ${userTexts.length}` }] },
          uuid: `m${userTexts.length}`,
          session_id: 's1',
        };
        yield {
          type: 'result',
          subtype: 'success',
          total_cost_usd: 0.01,
          session_id: 's1',
          uuid: `r${userTexts.length}`,
        };
      }
    })();

    return Object.assign(generator, {
      interrupt: async () => {
        interruptCalls.push(Date.now());
        return undefined;
      },
    });
  };

  const manager = createSessionManager({
    cwd: '/tmp',
    emit: (e) => events.push(e),
    queryFn: query as never,
  });

  manager.send('premier');
  await new Promise((r) => setTimeout(r, 20));

  await manager.interrupt();
  assert.equal(interruptCalls.length, 1);

  manager.send('apres interruption');
  await new Promise((r) => setTimeout(r, 20));

  assert.deepEqual(userTexts, ['premier', 'apres interruption']);
  assert.equal(manager.state().status, 'idle');

  await manager.stop();
});

test('un rejet de interrupt() émet une erreur au lieu de faire tomber le processus', async () => {
  const events: ServerEvent[] = [];

  const query = ({ prompt }: { prompt: unknown }) => {
    const iterable = prompt as AsyncIterable<{ message: { content: unknown } }>;
    const generator = (async function* () {
      for await (const _userMessage of iterable) {
        // ne répond jamais : on veut juste garder la session en vie
      }
    })();

    return Object.assign(generator, {
      interrupt: async () => {
        throw new Error('aucun tour en vol');
      },
    });
  };

  const manager = createSessionManager({ cwd: '/tmp', emit: (e) => events.push(e), queryFn: query as never });

  await manager.interrupt();

  const error = events.find((e) => e.type === 'error');
  assert.ok(error && error.type === 'error');
  assert.equal(error.message, 'aucun tour en vol');
  assert.equal(manager.state().status, 'idle');

  await manager.stop();
});

test('le statut passe à generating puis revient à idle', async () => {
  const states: string[] = [];
  const { query } = fakeQuery(() => [
    {
      type: 'assistant',
      message: { id: 'msg_1', content: [{ type: 'text', text: 'ok' }] },
      uuid: 'm1',
      session_id: 's1',
    },
    { type: 'result', subtype: 'success', total_cost_usd: 0.01, session_id: 's1', uuid: 'r1' },
  ]);

  const manager = createSessionManager({
    cwd: '/tmp',
    emit: (e) => {
      if (e.type === 'session.state') states.push(e.state.status);
    },
    queryFn: query,
  });

  manager.send('salut');
  await new Promise((r) => setTimeout(r, 20));

  assert.deepEqual(states, ['generating', 'idle']);
  await manager.stop();
});

test('les fragments partiels produisent des message.delta sous le même identifiant que le complete', async () => {
  const events: ServerEvent[] = [];
  const { query, options } = fakeQuery(() => [
    {
      type: 'stream_event',
      uuid: 'e1',
      session_id: 's1',
      parent_tool_use_id: null,
      event: { type: 'message_start', message: { id: 'msg_1', content: [] } },
    },
    {
      type: 'stream_event',
      uuid: 'e2',
      session_id: 's1',
      parent_tool_use_id: null,
      event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'bon' } },
    },
    {
      type: 'stream_event',
      uuid: 'e3',
      session_id: 's1',
      parent_tool_use_id: null,
      event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'jour' } },
    },
    {
      type: 'assistant',
      message: { id: 'msg_1', content: [{ type: 'text', text: 'bonjour' }] },
      uuid: 'm1',
      session_id: 's1',
    },
    { type: 'result', subtype: 'success', total_cost_usd: 0.01, session_id: 's1', uuid: 'r1' },
  ]);

  const manager = createSessionManager({ cwd: '/tmp', emit: (e) => events.push(e), queryFn: query });
  manager.send('salut');
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(options()?.includePartialMessages, true);

  const deltas = events.filter((e) => e.type === 'message.delta');
  assert.deepEqual(
    deltas.map((e) => e.text),
    ['bon', 'jour']
  );

  const complete = events.find((e) => e.type === 'message.complete' && e.role === 'assistant');
  assert.ok(complete && complete.type === 'message.complete');
  for (const delta of deltas) assert.equal(delta.messageId, complete.messageId);

  await manager.stop();
});

test('les fragments non textuels ne produisent aucun delta', async () => {
  const events: ServerEvent[] = [];
  const { query } = fakeQuery(() => [
    {
      type: 'stream_event',
      uuid: 'e1',
      session_id: 's1',
      parent_tool_use_id: null,
      event: { type: 'message_start', message: { id: 'msg_1', content: [] } },
    },
    {
      type: 'stream_event',
      uuid: 'e2',
      session_id: 's1',
      parent_tool_use_id: null,
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"a":' },
      },
    },
    { type: 'result', subtype: 'success', total_cost_usd: 0.01, session_id: 's1', uuid: 'r1' },
  ]);

  const manager = createSessionManager({ cwd: '/tmp', emit: (e) => events.push(e), queryFn: query });
  manager.send('salut');
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(events.filter((e) => e.type === 'message.delta').length, 0);
  await manager.stop();
});

test('le message de l utilisateur est diffusé dès son envoi', async () => {
  const events: ServerEvent[] = [];
  const { query } = fakeQuery(() => [
    {
      type: 'assistant',
      message: { id: 'msg_1', content: [{ type: 'text', text: 'bonjour' }] },
      uuid: 'm1',
      session_id: 's1',
    },
    { type: 'result', subtype: 'success', total_cost_usd: 0.01, session_id: 's1', uuid: 'r1' },
  ]);

  const manager = createSessionManager({ cwd: '/tmp', emit: (e) => events.push(e), queryFn: query });
  manager.send('salut');

  const echo = events.find((e) => e.type === 'message.complete');
  assert.ok(echo && echo.type === 'message.complete');
  assert.equal(echo.role, 'user');
  assert.equal(echo.text, 'salut');
  assert.ok(echo.messageId.length > 0);

  manager.send('encore');
  const echoIds = events.flatMap((e) =>
    e.type === 'message.complete' && e.role === 'user' ? [e.messageId] : []
  );
  assert.equal(echoIds.length, 2);
  assert.notEqual(echoIds[0], echoIds[1]);

  await new Promise((r) => setTimeout(r, 20));
  await manager.stop();
});

test('aucun session_id n est poussé dans le message utilisateur', async () => {
  const pushed: Record<string, unknown>[] = [];

  const query = ({ prompt }: { prompt: unknown }) => {
    const iterable = prompt as AsyncIterable<Record<string, unknown>>;
    return (async function* () {
      for await (const userMessage of iterable) {
        pushed.push(userMessage);
        yield { type: 'result', subtype: 'success', total_cost_usd: 0, session_id: 's1', uuid: 'r1' };
      }
    })();
  };

  const manager = createSessionManager({ cwd: '/tmp', emit: () => {}, queryFn: query as never });
  manager.send('salut');
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(pushed.length, 1);
  assert.ok(pushed[0] && !('session_id' in pushed[0]));

  await manager.stop();
});

test('le gestionnaire passe canUseTool au SDK et expose control', async () => {
  // `fakeQuery` capture déjà les options reçues : pas besoin d'un espion qui rappelle `query`.
  const { query, options } = fakeQuery(() => []);

  const manager = createSessionManager({ cwd: '/tmp', emit: () => {}, queryFn: query });

  assert.equal(typeof options()?.canUseTool, 'function', 'canUseTool doit etre passe a query()');
  assert.equal(typeof manager.control().interrupt, 'function', 'control() rend l objet Query');

  await manager.stop();
});

test('le gestionnaire expose les demandes en attente', async () => {
  const { query } = fakeQuery(() => []);
  const manager = createSessionManager({ cwd: '/tmp', emit: () => {}, queryFn: query });

  assert.deepEqual(manager.pendingPermissions(), []);
  await manager.stop();
});

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
