import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { Session } from './Session.tsx';
import { FakeWebSocket } from '../test-doubles.ts';

// Tous les appels de listener passent par `emit`, y compris les appels déjà existants avant
// cette feature : un listener invoqué hors `act` a coûté un `flushSync` de contournement en
// tranche 1 (mineur #10). `.at(-1)` et non `[0]` : chaque test qui rend `<Session />` crée sa
// propre instance de `FakeWebSocket`, et `instances` n'est jamais réinitialisé entre les tests
// de ce fichier — `[0]` capterait le socket du tout premier test à en créer un.
const emit = (event: unknown) => {
  act(() => {
    FakeWebSocket.instances.at(-1)?.onmessage?.({ data: JSON.stringify(event) });
  });
};

const demande = {
  requestId: 'r1',
  toolUseId: 'tu1',
  toolName: 'Bash',
  input: { command: 'ls' },
  canAlwaysAllow: true,
  defaultToNo: false,
};

test('affiche les trois régions fixes', () => {
  render(<Session />);
  expect(screen.getByRole('banner')).toBeDefined();
  expect(screen.getByRole('main')).toBeDefined();
  expect(screen.getByRole('contentinfo')).toBeDefined();
});

test('la barre supérieure porte les contrôles runtime', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);

  render(<Session />);
  emit({
    type: 'session.state',
    state: {
      sessionId: 's1',
      cwd: '/tmp',
      status: 'idle',
      model: 'claude-opus-5',
      permissionMode: 'default',
      effort: 'high',
      availableModels: [{ value: 'claude-opus-5', displayName: 'Opus 5' }],
      availableCommands: [],
      availableAgents: [],
      mcpServers: [],
    },
  });

  const banner = screen.getByRole('banner');
  expect(banner.textContent).toContain('Opus 5');
  expect(banner.textContent).toContain('high');
});

test('le pied de page porte de l état, pas de bouton', () => {
  render(<Session />);
  const footer = screen.getByRole('contentinfo');
  expect(footer.querySelectorAll('button').length).toBe(0);
});

test('la jauge de contexte affiche le pourcentage recu et alerte a 80%', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);
  render(<Session />);

  emit({
    type: 'context.usage',
    usage: { totalTokens: 400, maxTokens: 1000, percentage: 40, categories: [] },
  });
  let footer = screen.getByRole('contentinfo');
  expect(footer.textContent).toContain('40%');

  emit({
    type: 'context.usage',
    usage: { totalTokens: 850, maxTokens: 1000, percentage: 85, categories: [] },
  });
  footer = screen.getByRole('contentinfo');
  expect(footer.textContent).toContain('85%');
  const gauge = within(footer).getByText(/85%/);
  expect(gauge.getAttribute('style')).toContain('--warn');
});

test('le cout cumule remplace le placeholder du pied de page', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);
  render(<Session />);

  emit({ type: 'cost.usage', totalUsd: 1.236 });
  const footer = screen.getByRole('contentinfo');
  expect(footer.textContent).toContain('$1.24');
  expect(footer.textContent).not.toContain('$0.00');
});

test('le pied de page affiche la branche et les compteurs git reels', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);
  render(<Session />);

  emit({ type: 'git.state', git: { branch: 'tranche-3', dirty: 2, staged: 1 } });
  const footer = screen.getByRole('contentinfo');
  expect(footer.textContent).toContain('tranche-3');
  expect(footer.textContent).not.toContain('main');
});

test('la barre laterale est presente et le nom de projet vient du cwd de la session', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);
  render(<Session />);

  expect(screen.getByRole('complementary')).toBeDefined();

  emit({
    type: 'session.state',
    state: {
      sessionId: 's1',
      cwd: '/home/utilisateur/mon-projet',
      status: 'idle',
      model: null,
      permissionMode: 'default',
      effort: null,
      availableModels: [],
      availableCommands: [{ name: 'commit', description: '' }],
      availableAgents: [],
      mcpServers: [{ name: 'linear', status: 'connected', toolCount: 2 }],
    },
  });

  const footer = screen.getByRole('contentinfo');
  expect(footer.textContent).toContain('mon-projet');
  expect(footer.textContent).toContain('1 skills · 1 MCP');
});

test('le statut de connexion au pied de page reflete l etat reel', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);
  render(<Session />);

  emit({
    type: 'session.state',
    state: {
      sessionId: null,
      cwd: '/tmp',
      status: 'disconnected',
      model: null,
      permissionMode: null,
      effort: null,
      availableModels: [],
      availableCommands: [],
      availableAgents: [],
      mcpServers: [],
    },
  });

  const footer = screen.getByRole('contentinfo');
  expect(footer.textContent).toContain('déconnecté');
});

test('cliquer le rappel des extensions bascule la barre laterale sur skills et mcp', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);
  render(<Session />);

  emit({
    type: 'session.state',
    state: {
      sessionId: 's1',
      cwd: '/tmp',
      status: 'idle',
      model: null,
      permissionMode: 'default',
      effort: null,
      availableModels: [],
      availableCommands: [{ name: 'commit', description: '' }],
      availableAgents: [],
      mcpServers: [{ name: 'linear', status: 'connected', toolCount: 2 }],
    },
  });

  fireEvent.click(screen.getByText('1 skills · 1 MCP'));
  expect(screen.getByRole('button', { name: /skills et mcp/i }).getAttribute('aria-pressed')).toBe('true');
});

test('cliquer la jauge ouvre le popover et demande le detail complet', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);
  render(<Session />);

  emit({
    type: 'context.usage',
    usage: { totalTokens: 400, maxTokens: 1000, percentage: 40, categories: [{ name: 'Messages', tokens: 400 }] },
  });

  fireEvent.click(screen.getByText('40%'));

  const socket = FakeWebSocket.instances.at(-1);
  expect(socket?.sent).toContain(JSON.stringify({ type: 'context.request-full' }));
  expect(screen.getByRole('dialog').textContent).toContain('Messages');
});

test('compacter depuis le popover envoie context.compact au serveur', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);
  render(<Session />);

  emit({
    type: 'context.usage',
    usage: { totalTokens: 400, maxTokens: 1000, percentage: 40, categories: [] },
  });
  fireEvent.click(screen.getByText('40%'));
  fireEvent.click(screen.getByRole('button', { name: /compact/i }));

  const socket = FakeWebSocket.instances.at(-1);
  expect(socket?.sent).toContain(JSON.stringify({ type: 'context.compact' }));
});

test('un message reçu apparaît dans la conversation', async () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);

  render(<Session />);

  emit({
    type: 'message.complete',
    messageId: 'm1',
    role: 'assistant',
    text: 'bonjour',
  });

  expect(await screen.findByText('bonjour')).toBeDefined();
});

test('un appel d outil ne rend rien dans la conversation', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);

  render(<Session />);

  emit({ type: 'tool.activity', toolUseId: 't1', name: 'Bash', target: 'ls' });

  expect(screen.getByRole('main').textContent).not.toContain('Bash');
  expect(screen.getByRole('main').textContent).not.toContain('ls');
});

test('l indicateur de génération apparaît et permet d interrompre', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);

  render(<Session />);

  const socket = FakeWebSocket.instances.at(-1);
  emit({
    type: 'session.state',
    state: {
      sessionId: 's1',
      cwd: '/tmp',
      status: 'generating',
      model: 'claude-opus-5',
      permissionMode: 'default',
      effort: null,
      availableModels: [],
      availableCommands: [],
      availableAgents: [],
      mcpServers: [],
    },
  });

  const button = screen.getByRole('button', { name: /interrompre/i });
  fireEvent.click(button);

  expect(socket?.sent).toContain(JSON.stringify({ type: 'session.interrupt' }));
});

test('un événement error affiche un bandeau visible dans la conversation', async () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);

  render(<Session />);

  emit({ type: 'error', message: 'clé API absente' });

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('clé API absente');
});

test('l indicateur est absent au repos', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);

  render(<Session />);
  expect(screen.queryByRole('button', { name: /interrompre/i })).toBeNull();
});

test('le rappel apparait pendant l attente et disparait apres la decision', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);

  render(<Session />);

  expect(screen.queryByRole('status')).toBeNull();

  emit({ type: 'permission.request', request: demande });
  expect(screen.getByRole('status').textContent).toMatch(/Bash/);

  emit({ type: 'permission.resolved', requestId: 'r1', decision: 'allow' });
  expect(screen.queryByRole('status')).toBeNull();
});

test('autoriser depuis le rappel envoie la commande au serveur', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);

  render(<Session />);
  emit({ type: 'permission.request', request: demande });

  // Le clic est porté sur le bouton DU RAPPEL, pas sur celui du bloc : sans ce cadrage, le test
  // passerait déjà grâce au bloc de la feature 02 et ne vérifierait jamais le rappel.
  const rappel = screen.getByRole('status');
  fireEvent.click(within(rappel).getByRole('button', { name: /autoriser/i }));

  const socket = FakeWebSocket.instances.at(-1);
  const sent = socket?.sent.map((s) => JSON.parse(s)) ?? [];
  expect(sent).toContainEqual({ type: 'permission.respond', requestId: 'r1', decision: 'allow' });
});

test('la saisie reste utilisable pendant l attente', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);

  render(<Session />);
  emit({
    type: 'session.state',
    state: {
      sessionId: 's1',
      cwd: '/tmp',
      status: 'awaiting-permission',
      model: null,
      permissionMode: 'default',
      effort: null,
      availableModels: [],
      availableCommands: [],
      availableAgents: [],
      mcpServers: [],
    },
  });
  emit({ type: 'permission.request', request: demande });

  // Les deux assertions comptent ensemble. Sans la première, le test serait vacuement vrai : le
  // composeur n'est désactivé que sur `disconnected`, donc il passerait sans que le rappel existe.
  expect(screen.getByRole('status')).toBeDefined();
  const champ = screen.getByLabelText('Message') as HTMLTextAreaElement;
  expect(champ.disabled).toBe(false);
});

test('le bloc du fil et le rappel repondent tous les deux', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);

  render(<Session />);
  emit({ type: 'permission.request', request: demande });

  expect(screen.getAllByRole('button', { name: /autoriser/i }).length).toBeGreaterThanOrEqual(2);
});

test('echap ne coupe pas la generation quand les reglages sont ouverts', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);

  render(<Session />);
  emit({
    type: 'session.state',
    state: {
      sessionId: 's1',
      cwd: '/tmp',
      status: 'generating',
      model: null,
      permissionMode: null,
      effort: null,
      availableModels: [],
      availableCommands: [],
      availableAgents: [],
      mcpServers: [],
    },
  });

  fireEvent.click(screen.getByRole('button', { name: /réglages/i }));
  fireEvent.keyDown(window, { key: 'Escape' });

  const sent = FakeWebSocket.instances.at(-1)?.sent.map((s) => JSON.parse(s)) ?? [];
  expect(sent).not.toContainEqual({ type: 'session.interrupt' });
});
