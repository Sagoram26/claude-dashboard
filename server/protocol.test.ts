import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClientCommand } from './protocol.ts';

test('parse une commande valide', () => {
  const cmd = parseClientCommand(JSON.stringify({ type: 'message.send', text: 'salut' }));
  assert.deepEqual(cmd, { type: 'message.send', text: 'salut' });
});

test('rejette un JSON invalide sans lever', () => {
  assert.equal(parseClientCommand('{pas du json'), null);
});

test('rejette un type inconnu', () => {
  assert.equal(parseClientCommand(JSON.stringify({ type: 'message.explode' })), null);
});

test('rejette une commande au bon type mais mal formée', () => {
  assert.equal(parseClientCommand(JSON.stringify({ type: 'message.send' })), null);
});
