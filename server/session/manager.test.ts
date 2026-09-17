import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionManager } from './manager.ts';
import type { ServerEvent } from '../protocol.ts';

function fakeQuery(scenario: (userTexts: string[]) => unknown[]) {
  const userTexts: string[] = [];

  const query = ({ prompt }: { prompt: unknown }) => {
    const iterable = prompt as AsyncIterable<{ message: { content: unknown } }>;

    return (async function* () {
      for await (const userMessage of iterable) {
        const content = userMessage.message.content;
        userTexts.push(typeof content === 'string' ? content : JSON.stringify(content));
        for (const event of scenario(userTexts)) yield event;
      }
    })();
  };

  return { query: query as never, userTexts };
}

test('un message envoyé atteint le SDK et sa réponse est diffusée', async () => {
  const events: ServerEvent[] = [];
  const { query, userTexts } = fakeQuery(() => [
    {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'bonjour' }] },
      uuid: 'm1',
      session_id: 's1',
    },
    { type: 'result', subtype: 'success', total_cost_usd: 0.01, session_id: 's1', uuid: 'r1' },
  ]);

  const manager = createSessionManager({ cwd: '/tmp', emit: (e) => events.push(e), queryFn: query });
  manager.send('salut');
  await new Promise((r) => setTimeout(r, 20));

  assert.deepEqual(userTexts, ['salut']);
  const complete = events.find((e) => e.type === 'message.complete');
  assert.ok(complete && complete.type === 'message.complete');
  assert.equal(complete.text, 'bonjour');

  await manager.stop();
});

test('deux messages successifs restent dans la même session', async () => {
  const events: ServerEvent[] = [];
  const { query, userTexts } = fakeQuery((texts) => [
    {
      type: 'assistant',
      message: { content: [{ type: 'text', text: `reponse ${texts.length}` }] },
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
  const completes = events.filter((e) => e.type === 'message.complete');
  assert.equal(completes.length, 2);

  await manager.stop();
});

test('les appels d outils ne produisent jamais de message de conversation', async () => {
  const events: ServerEvent[] = [];
  const { query } = fakeQuery(() => [
    {
      type: 'assistant',
      message: {
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

  const complete = events.find((e) => e.type === 'message.complete');
  assert.ok(complete && complete.type === 'message.complete');
  assert.equal(complete.text, 'voila');

  const activity = events.filter((e) => e.type === 'tool.activity');
  assert.equal(activity.length, 1);

  await manager.stop();
});
