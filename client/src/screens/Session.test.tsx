import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Session } from './Session.tsx';
import { FakeWebSocket } from '../test-doubles.ts';

test('affiche les trois régions fixes', () => {
  render(<Session />);
  expect(screen.getByRole('banner')).toBeDefined();
  expect(screen.getByRole('main')).toBeDefined();
  expect(screen.getByRole('contentinfo')).toBeDefined();
});

test('la barre supérieure porte les contrôles runtime', () => {
  render(<Session />);
  const banner = screen.getByRole('banner');
  expect(banner.textContent).toContain('Opus 5');
  expect(banner.textContent).toContain('high');
});

test('le pied de page porte de l état, pas de bouton', () => {
  render(<Session />);
  const footer = screen.getByRole('contentinfo');
  expect(footer.querySelectorAll('button').length).toBe(0);
});

test('un message reçu apparaît dans la conversation', async () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);

  render(<Session />);

  const socket = FakeWebSocket.instances.at(-1);
  socket?.onmessage?.({
    data: JSON.stringify({
      type: 'message.complete',
      messageId: 'm1',
      role: 'assistant',
      text: 'bonjour',
    }),
  });

  expect(await screen.findByText('bonjour')).toBeDefined();
});

test('un appel d outil ne rend rien dans la conversation', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);

  render(<Session />);

  const socket = FakeWebSocket.instances.at(-1);
  socket?.onmessage?.({
    data: JSON.stringify({ type: 'tool.activity', toolUseId: 't1', name: 'Bash', target: 'ls' }),
  });

  expect(screen.getByRole('main').textContent).not.toContain('Bash');
  expect(screen.getByRole('main').textContent).not.toContain('ls');
});

test('l indicateur de génération apparaît et permet d interrompre', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);

  render(<Session />);

  const socket = FakeWebSocket.instances.at(-1);
  act(() => {
    socket?.onmessage?.({
      data: JSON.stringify({
        type: 'session.state',
        state: {
          sessionId: 's1',
          cwd: '/tmp',
          status: 'generating',
          model: 'claude-opus-5',
          permissionMode: 'default',
        },
      }),
    });
  });

  const button = screen.getByRole('button', { name: /interrompre/i });
  fireEvent.click(button);

  expect(socket?.sent).toContain(JSON.stringify({ type: 'session.interrupt' }));
});

test('un événement error affiche un bandeau visible dans la conversation', async () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);

  render(<Session />);

  const socket = FakeWebSocket.instances.at(-1);
  socket?.onmessage?.({
    data: JSON.stringify({ type: 'error', message: 'clé API absente' }),
  });

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('clé API absente');
});

test('l indicateur est absent au repos', () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);

  render(<Session />);
  expect(screen.queryByRole('button', { name: /interrompre/i })).toBeNull();
});
