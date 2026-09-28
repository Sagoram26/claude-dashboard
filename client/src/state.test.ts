import { test, expect } from 'vitest';
import { initialState, reduceEvent } from './state.ts';
import type { PermissionRequest } from '../../server/protocol.ts';

test('un delta crée un message en cours de streaming', () => {
  const state = reduceEvent(initialState, {
    type: 'message.delta',
    messageId: 'm1',
    text: 'bon',
  });

  expect(state.thread).toEqual([
    { kind: 'message', id: 'm1', role: 'assistant', text: 'bon', streaming: true },
  ]);
});

test('les deltas successifs s accumulent sur le même message', () => {
  let state = reduceEvent(initialState, { type: 'message.delta', messageId: 'm1', text: 'bon' });
  state = reduceEvent(state, { type: 'message.delta', messageId: 'm1', text: 'jour' });

  expect(state.thread).toHaveLength(1);
  const entry = state.thread[0];
  expect(entry?.kind === 'message' && entry.text).toBe('bonjour');
});

test('message.complete fige le texte et arrête le streaming', () => {
  let state = reduceEvent(initialState, { type: 'message.delta', messageId: 'm1', text: 'bon' });
  state = reduceEvent(state, {
    type: 'message.complete',
    messageId: 'm1',
    role: 'assistant',
    text: 'bonjour',
  });

  expect(state.thread[0]).toEqual({
    kind: 'message',
    id: 'm1',
    role: 'assistant',
    text: 'bonjour',
    streaming: false,
  });
});

test('un événement error est retenu dans l état, sans créer de message', () => {
  const state = reduceEvent(initialState, { type: 'error', message: 'clé API absente' });

  expect(state.thread).toEqual([]);
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

  expect(state.thread).toEqual([]);
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

  expect(state.thread).toEqual([
    { kind: 'message', id: messageId, role: 'assistant', text: 'bonjour', streaming: false },
  ]);
});

const request = (over: Partial<PermissionRequest> = {}): PermissionRequest => ({
  requestId: 'r1',
  toolUseId: 'tu1',
  toolName: 'Bash',
  input: { command: 'ls -la' },
  canAlwaysAllow: true,
  defaultToNo: false,
  ...over,
});

test('une demande entre dans le fil a sa place chronologique', () => {
  let state = initialState;
  state = reduceEvent(state, { type: 'message.complete', messageId: 'm1', role: 'user', text: 'salut' });
  state = reduceEvent(state, { type: 'permission.request', request: request() });
  state = reduceEvent(state, { type: 'message.complete', messageId: 'm2', role: 'assistant', text: 'fait' });

  expect(state.thread.map((e) => e.kind)).toEqual(['message', 'approval', 'message']);
});

test('la decision reste dans le fil au lieu de disparaitre', () => {
  let state = initialState;
  state = reduceEvent(state, { type: 'permission.request', request: request() });
  state = reduceEvent(state, { type: 'permission.resolved', requestId: 'r1', decision: 'allow' });

  expect(state.thread).toHaveLength(1);
  const entry = state.thread[0];
  expect(entry?.kind).toBe('approval');
  expect(entry?.kind === 'approval' && entry.decision).toBe('allow');
});

test('une demande rejouee apres reconnexion ne se duplique pas', () => {
  let state = initialState;
  state = reduceEvent(state, { type: 'permission.request', request: request() });
  state = reduceEvent(state, { type: 'permission.request', request: request() });

  expect(state.thread).toHaveLength(1);
});

test('une resolution pour une demande inconnue ne cree rien', () => {
  const state = reduceEvent(initialState, {
    type: 'permission.resolved',
    requestId: 'jamais-vu',
    decision: 'deny',
  });
  expect(state.thread).toHaveLength(0);
});

test('pendingApprovals ne compte que les demandes non tranchees', () => {
  let state = initialState;
  state = reduceEvent(state, { type: 'permission.request', request: request({ requestId: 'a' }) });
  state = reduceEvent(state, { type: 'permission.request', request: request({ requestId: 'b' }) });
  expect(state.thread.filter((e) => e.kind === 'approval' && e.decision === null)).toHaveLength(2);

  state = reduceEvent(state, { type: 'permission.resolved', requestId: 'a', decision: 'always' });
  expect(state.thread.filter((e) => e.kind === 'approval' && e.decision === null)).toHaveLength(1);
});

test('permission.granted remplace la liste au lieu de l accumuler', () => {
  let state = initialState;
  state = reduceEvent(state, {
    type: 'permission.granted',
    granted: [{ toolName: 'Bash', grantedAt: '2026-09-18T10:00:00.000Z' }],
  });
  state = reduceEvent(state, {
    type: 'permission.granted',
    granted: [
      { toolName: 'Bash', grantedAt: '2026-09-18T10:00:00.000Z' },
      { toolName: 'Read', grantedAt: '2026-09-18T10:05:00.000Z' },
    ],
  });

  expect(state.granted.map((g) => g.toolName)).toEqual(['Bash', 'Read']);
});

test('une revocation cote serveur vide la liste', () => {
  let state = reduceEvent(initialState, {
    type: 'permission.granted',
    granted: [{ toolName: 'Bash', grantedAt: '2026-09-18T10:00:00.000Z' }],
  });
  state = reduceEvent(state, { type: 'permission.granted', granted: [] });
  expect(state.granted).toEqual([]);
});

test('un session.state met a jour modele effort mode et modeles disponibles', () => {
  const state = reduceEvent(initialState, {
    type: 'session.state',
    state: {
      sessionId: 's1',
      cwd: '/tmp',
      status: 'idle',
      model: 'claude-sonnet-5',
      permissionMode: 'plan',
      effort: 'high',
      availableModels: [{ value: 'claude-sonnet-5', displayName: 'Sonnet 5' }],
      availableCommands: [{ name: 'commit', description: 'ecrit un commit' }],
      availableAgents: [{ name: 'Explore', description: 'recherche en lecture seule' }],
      mcpServers: [{ name: 'linear', status: 'connected', toolCount: 3 }],
    },
  });

  expect(state.model).toBe('claude-sonnet-5');
  expect(state.effort).toBe('high');
  expect(state.permissionMode).toBe('plan');
  expect(state.availableModels).toEqual([{ value: 'claude-sonnet-5', displayName: 'Sonnet 5' }]);
  expect(state.availableCommands).toEqual([{ name: 'commit', description: 'ecrit un commit' }]);
  expect(state.availableAgents).toEqual([{ name: 'Explore', description: 'recherche en lecture seule' }]);
  expect(state.mcpServers).toEqual([{ name: 'linear', status: 'connected', toolCount: 3 }]);
  expect(state.cwd).toBe('/tmp');
});

test('context.usage remplace la jauge par la derniere valeur recue', () => {
  const usage = {
    totalTokens: 4000,
    maxTokens: 5000,
    percentage: 80,
    categories: [{ name: 'Messages', tokens: 4000 }],
  };
  const state = reduceEvent(initialState, { type: 'context.usage', usage });

  expect(state.contextUsage).toEqual(usage);
});

test('context.usage successifs ne s accumulent pas, seul le dernier compte', () => {
  let state = reduceEvent(initialState, {
    type: 'context.usage',
    usage: { totalTokens: 1000, maxTokens: 5000, percentage: 20, categories: [] },
  });
  state = reduceEvent(state, {
    type: 'context.usage',
    usage: { totalTokens: 2000, maxTokens: 5000, percentage: 40, categories: [] },
  });

  expect(state.contextUsage?.percentage).toBe(40);
});

test('cost.usage retient le dernier total, sans les additionner', () => {
  let state = reduceEvent(initialState, { type: 'cost.usage', totalUsd: 0.12 });
  state = reduceEvent(state, { type: 'cost.usage', totalUsd: 0.34 });

  expect(state.costUsd).toBe(0.34);
});

test('git.state remplace la branche et les compteurs precedents', () => {
  let state = reduceEvent(initialState, {
    type: 'git.state',
    git: { branch: 'main', dirty: 1, staged: 0 },
  });
  state = reduceEvent(state, {
    type: 'git.state',
    git: { branch: 'tranche-3', dirty: 2, staged: 1 },
  });

  expect(state.git).toEqual({ branch: 'tranche-3', dirty: 2, staged: 1 });
});

test('files.changed remplace la liste des fichiers modifies', () => {
  const files = [{ path: 'src/a.ts', added: 3, removed: 1 }];
  const state = reduceEvent(initialState, { type: 'files.changed', files });

  expect(state.changedFiles).toEqual(files);
});
