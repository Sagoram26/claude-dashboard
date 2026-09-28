import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from './index.ts';

test('le serveur répond sur /health', async () => {
  const server = await createServer(0);
  try {
    const res = await fetch(`http://127.0.0.1:${server.port}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  } finally {
    await server.close();
  }
});

test('/sessions rend la liste fournie par listSessions', async () => {
  const sessions = [{ cwd: '/repo', sessionId: 's1', title: 't', branch: 'main', lastActivity: '2026-01-01T00:00:00.000Z', fromDashboard: true }];
  const server = await createServer(0, { listSessions: async () => sessions });
  try {
    const res = await fetch(`http://127.0.0.1:${server.port}/sessions`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), sessions);
  } finally {
    await server.close();
  }
});

test('/sessions sans listSessions fourni rend une liste vide, jamais une erreur', async () => {
  const server = await createServer(0);
  try {
    const res = await fetch(`http://127.0.0.1:${server.port}/sessions`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), []);
  } finally {
    await server.close();
  }
});
