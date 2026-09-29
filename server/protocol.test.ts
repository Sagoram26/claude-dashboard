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

test('workflow.resume avec action continue est accepte', () => {
  const cmd = parseClientCommand(
    JSON.stringify({ type: 'workflow.resume', checkpointId: 'c1', action: 'continue' })
  );
  assert.deepEqual(cmd, { type: 'workflow.resume', checkpointId: 'c1', action: 'continue' });
});

test('workflow.resume avec action correct est accepte', () => {
  const cmd = parseClientCommand(
    JSON.stringify({ type: 'workflow.resume', checkpointId: 'c1', action: 'correct' })
  );
  assert.deepEqual(cmd, { type: 'workflow.resume', checkpointId: 'c1', action: 'correct' });
});

test('workflow.resume sans action est rejete', () => {
  assert.equal(parseClientCommand(JSON.stringify({ type: 'workflow.resume', checkpointId: 'c1' })), null);
});

test('workflow.resume avec une action inconnue est rejete', () => {
  assert.equal(
    parseClientCommand(JSON.stringify({ type: 'workflow.resume', checkpointId: 'c1', action: 'annuler' })),
    null
  );
});

test('workflow.save avec un workflow bien forme est accepte', () => {
  const workflow = { id: 'w1', name: 'Mon workflow', steps: [] };
  const cmd = parseClientCommand(JSON.stringify({ type: 'workflow.save', workflow }));
  assert.deepEqual(cmd, { type: 'workflow.save', workflow });
});

test('workflow.save sans id ni name est rejete', () => {
  assert.equal(
    parseClientCommand(JSON.stringify({ type: 'workflow.save', workflow: { steps: [] } })),
    null
  );
});

test('workflow.delete avec un id est accepte', () => {
  const cmd = parseClientCommand(JSON.stringify({ type: 'workflow.delete', id: 'w1' }));
  assert.deepEqual(cmd, { type: 'workflow.delete', id: 'w1' });
});

test('workflow.delete sans id est rejete', () => {
  assert.equal(parseClientCommand(JSON.stringify({ type: 'workflow.delete' })), null);
});

test('prompt.save avec un prompt bien forme est accepte', () => {
  const prompt = { id: 'p1', name: 'Mon prompt', text: 'Fais X', pinned: false };
  const cmd = parseClientCommand(JSON.stringify({ type: 'prompt.save', prompt }));
  assert.deepEqual(cmd, { type: 'prompt.save', prompt });
});

test('prompt.save sans id ni name est rejete', () => {
  assert.equal(
    parseClientCommand(JSON.stringify({ type: 'prompt.save', prompt: { text: 'X' } })),
    null
  );
});

test('prompt.delete avec un id est accepte', () => {
  const cmd = parseClientCommand(JSON.stringify({ type: 'prompt.delete', id: 'p1' }));
  assert.deepEqual(cmd, { type: 'prompt.delete', id: 'p1' });
});

test('prompt.delete sans id est rejete', () => {
  assert.equal(parseClientCommand(JSON.stringify({ type: 'prompt.delete' })), null);
});
