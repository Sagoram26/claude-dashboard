import { test, expect, vi } from 'vitest';
import { connect } from './socket.ts';
import type { ServerEvent } from '../../server/protocol.ts';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  sent: string[] = [];
  readyState = 1;
  onmessage: ((e: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(payload: string) { this.sent.push(payload); }
  close() { this.readyState = 3; }
}

test('transmet les événements reçus au callback', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);
  const seen: ServerEvent[] = [];

  connect('ws://test/ws', (event) => seen.push(event));
  const socket = FakeWebSocket.instances.at(-1);
  socket?.onmessage?.({ data: JSON.stringify({ type: 'cost.usage', totalUsd: 1.5 }) });

  expect(seen).toEqual([{ type: 'cost.usage', totalUsd: 1.5 }]);
});

test('sérialise les commandes envoyées', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);
  const conn = connect('ws://test/ws', () => {});
  conn.send({ type: 'message.send', text: 'salut' });

  const socket = FakeWebSocket.instances.at(-1);
  expect(socket?.sent).toEqual([JSON.stringify({ type: 'message.send', text: 'salut' })]);
});

test('ignore un message serveur illisible', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);
  const seen: ServerEvent[] = [];

  connect('ws://test/ws', (event) => seen.push(event));
  const socket = FakeWebSocket.instances.at(-1);
  socket?.onmessage?.({ data: 'pas du json' });

  expect(seen).toEqual([]);
});
