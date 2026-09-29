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

test('workflow.start avec un workflowId bien forme est accepte', () => {
  const cmd = parseClientCommand(JSON.stringify({ type: 'workflow.start', workflowId: 'w1' }));
  assert.deepEqual(cmd, { type: 'workflow.start', workflowId: 'w1' });
});

// B4 : id fourni par le client concatene tel quel dans un chemin de fichier cote serveur
// (server/workflows/store.ts, server/prompts/store.ts). Un id contenant '/', '\' ou '..' doit
// etre rejete par le validateur de protocole avant meme d'atteindre le disque.
const idsMalicieux = ['../../.claude/settings', '..\\..\\secrets', 'a/b', 'a\\b', '..', 'foo/../bar'];

for (const id of idsMalicieux) {
  test(`workflow.save avec id malicieux "${id}" est rejete`, () => {
    const workflow = { id, name: 'x', steps: [] };
    assert.equal(parseClientCommand(JSON.stringify({ type: 'workflow.save', workflow })), null);
  });

  test(`workflow.delete avec id malicieux "${id}" est rejete`, () => {
    assert.equal(parseClientCommand(JSON.stringify({ type: 'workflow.delete', id })), null);
  });

  test(`prompt.save avec id malicieux "${id}" est rejete`, () => {
    const prompt = { id, name: 'x', text: '', pinned: false };
    assert.equal(parseClientCommand(JSON.stringify({ type: 'prompt.save', prompt })), null);
  });

  test(`prompt.delete avec id malicieux "${id}" est rejete`, () => {
    assert.equal(parseClientCommand(JSON.stringify({ type: 'prompt.delete', id })), null);
  });

  test(`workflow.start avec workflowId malicieux "${id}" est rejete`, () => {
    assert.equal(parseClientCommand(JSON.stringify({ type: 'workflow.start', workflowId: id })), null);
  });

  test(`workflow.resume avec checkpointId malicieux "${id}" est rejete`, () => {
    assert.equal(
      parseClientCommand(JSON.stringify({ type: 'workflow.resume', checkpointId: id, action: 'continue' })),
      null
    );
  });
}

test('workflow.save/delete, prompt.save/delete avec un id valide (lettres, chiffres, tirets) sont acceptes', () => {
  assert.notEqual(
    parseClientCommand(JSON.stringify({ type: 'workflow.save', workflow: { id: 'w1-abc_2', name: 'x', steps: [] } })),
    null
  );
  assert.notEqual(parseClientCommand(JSON.stringify({ type: 'workflow.delete', id: 'w1-abc_2' })), null);
  assert.notEqual(
    parseClientCommand(JSON.stringify({ type: 'prompt.save', prompt: { id: 'p1-abc_2', name: 'x', text: '', pinned: false } })),
    null
  );
  assert.notEqual(parseClientCommand(JSON.stringify({ type: 'prompt.delete', id: 'p1-abc_2' })), null);
});
