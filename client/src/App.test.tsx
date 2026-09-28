import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from './App.tsx';
import { FakeWebSocket } from './test-doubles.ts';

test('ouvre sur l accueil puis bascule sur la session en reprenant une carte reprenable', async () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      json: async () => [
        {
          cwd: '/repo/projet-a',
          sessionId: 's1',
          title: 'Session en cours',
          branch: 'main',
          lastActivity: '2026-09-28T10:00:00.000Z',
          fromDashboard: true,
          resumable: true,
        },
      ],
    })
  );

  render(<App />);

  const carte = await screen.findByText('Session en cours');
  expect(screen.queryByRole('banner')).toBeNull();

  fireEvent.click(carte);

  expect(await screen.findByRole('banner')).toBeDefined();
});
