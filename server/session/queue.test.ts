import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMessageQueue } from './queue.ts';

test('livre un élément poussé avant la lecture', async () => {
  const q = createMessageQueue<string>();
  q.push('a');

  const it = q.stream[Symbol.asyncIterator]();
  assert.deepEqual(await it.next(), { value: 'a', done: false });
});

test('attend un élément poussé après le début de la lecture', async () => {
  const q = createMessageQueue<string>();
  const it = q.stream[Symbol.asyncIterator]();

  const pending = it.next();
  q.push('b');

  assert.deepEqual(await pending, { value: 'b', done: false });
});

test('reste ouverte entre deux éléments', async () => {
  const q = createMessageQueue<string>();
  const it = q.stream[Symbol.asyncIterator]();

  q.push('un');
  assert.equal((await it.next()).value, 'un');

  const pending = it.next();
  q.push('deux');
  assert.equal((await pending).value, 'deux');
});

test('se termine sur close', async () => {
  const q = createMessageQueue<string>();
  const it = q.stream[Symbol.asyncIterator]();

  const pending = it.next();
  q.close();

  assert.equal((await pending).done, true);
});
