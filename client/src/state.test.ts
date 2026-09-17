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
