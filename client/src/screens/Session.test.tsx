import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Session } from './Session.tsx';

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
  const listeners: ((e: { data: string }) => void)[] = [];

  class FakeWebSocket {
    readyState = 1;
    sent: string[] = [];
    set onmessage(fn: (e: { data: string }) => void) { listeners.push(fn); }
    send(payload: string) { this.sent.push(payload); }
    close() {}
  }
  vi.stubGlobal('WebSocket', FakeWebSocket);

  render(<Session />);

  listeners[0]?.({
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
  const listeners: ((e: { data: string }) => void)[] = [];

  class FakeWebSocket {
    readyState = 1;
    set onmessage(fn: (e: { data: string }) => void) { listeners.push(fn); }
    send() {}
    close() {}
  }
  vi.stubGlobal('WebSocket', FakeWebSocket);

  render(<Session />);

  listeners[0]?.({
    data: JSON.stringify({ type: 'tool.activity', toolUseId: 't1', name: 'Bash', target: 'ls' }),
  });

  expect(screen.getByRole('main').textContent).not.toContain('Bash');
  expect(screen.getByRole('main').textContent).not.toContain('ls');
});
