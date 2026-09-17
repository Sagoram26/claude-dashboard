import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createServer } from './index.ts';
import type { ServerEvent } from './protocol.ts';

test('une commande envoyée revient traitée par le handler', async () => {
  const seen: string[] = [];

  const server = await createServer(0, {
    onCommand: (cmd, send) => {
      seen.push(cmd.type);
      send({ type: 'cost.usage', totalUsd: 0.42 });
    },
  });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    await new Promise((resolve) => ws.once('open', resolve));

    const received = new Promise<ServerEvent>((resolve) => {
      ws.once('message', (data) => resolve(JSON.parse(data.toString())));
    });

    ws.send(JSON.stringify({ type: 'message.send', text: 'salut' }));
    const event = await received;

    assert.deepEqual(seen, ['message.send']);
    assert.deepEqual(event, { type: 'cost.usage', totalUsd: 0.42 });
    ws.close();
  } finally {
    await server.close();
  }
});

test('une commande invalide ne fait pas tomber le serveur', async () => {
  const seen: string[] = [];
  const server = await createServer(0, { onCommand: (cmd) => seen.push(cmd.type) });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    await new Promise((resolve) => ws.once('open', resolve));

    ws.send('{pas du json');
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.deepEqual(seen, []);
    assert.equal(ws.readyState, WebSocket.OPEN);
    ws.close();
  } finally {
    await server.close();
  }
});
