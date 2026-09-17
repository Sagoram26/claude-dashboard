import { test, expect } from 'vitest';
import { initialState, reduceEvent } from './state.ts';

test('un delta crée un message en cours de streaming', () => {
  const state = reduceEvent(initialState, {
    type: 'message.delta',
    messageId: 'm1',
    text: 'bon',
  });

  expect(state.messages).toEqual([
    { id: 'm1', role: 'assistant', text: 'bon', streaming: true },
  ]);
});

test('les deltas successifs s accumulent sur le même message', () => {
  let state = reduceEvent(initialState, { type: 'message.delta', messageId: 'm1', text: 'bon' });
  state = reduceEvent(state, { type: 'message.delta', messageId: 'm1', text: 'jour' });

  expect(state.messages).toHaveLength(1);
  expect(state.messages[0]?.text).toBe('bonjour');
});

test('message.complete fige le texte et arrête le streaming', () => {
  let state = reduceEvent(initialState, { type: 'message.delta', messageId: 'm1', text: 'bon' });
  state = reduceEvent(state, {
    type: 'message.complete',
    messageId: 'm1',
    role: 'assistant',
    text: 'bonjour',
  });

  expect(state.messages[0]).toEqual({
    id: 'm1',
    role: 'assistant',
    text: 'bonjour',
    streaming: false,
  });
});

test('un événement error est retenu dans l état, sans créer de message', () => {
  const state = reduceEvent(initialState, { type: 'error', message: 'clé API absente' });

  expect(state.messages).toEqual([]);
  expect(state.error).toBe('clé API absente');
});

test('un nouvel événement error remplace le précédent', () => {
  let state = reduceEvent(initialState, { type: 'error', message: 'premier' });
  state = reduceEvent(state, { type: 'error', message: 'second' });

  expect(state.error).toBe('second');
});

test('un appel d outil ne crée aucun message', () => {
  const state = reduceEvent(initialState, {
    type: 'tool.activity',
    toolUseId: 't1',
    name: 'Bash',
    target: 'ls',
  });

  expect(state.messages).toEqual([]);
  expect(state.toolActivityCount).toBe(1);
});

test('une séquence de deltas suivie du complete ne produit qu un seul message', () => {
  const messageId = 'msg_1';
  let state = reduceEvent(initialState, { type: 'message.delta', messageId, text: 'bon' });
  state = reduceEvent(state, { type: 'message.delta', messageId, text: 'jour' });
  state = reduceEvent(state, {
    type: 'message.complete',
    messageId,
    role: 'assistant',
    text: 'bonjour',
  });

  expect(state.messages).toEqual([
    { id: messageId, role: 'assistant', text: 'bonjour', streaming: false },
  ]);
});
