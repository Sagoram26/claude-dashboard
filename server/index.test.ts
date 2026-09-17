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
