import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HomeScreen } from './HomeScreen.tsx';

const sessions = [
  {
    cwd: '/repo/projet-a',
    sessionId: 'live-1',
    title: 'Session en cours',
    branch: 'main',
    lastActivity: '2026-09-28T10:00:00.000Z',
    fromDashboard: true,
    resumable: true,
  },
  {
    cwd: '/repo/projet-b',
    sessionId: 'idle-1',
    title: 'Session au repos',
    branch: 'develop',
    lastActivity: '2026-09-20T10:00:00.000Z',
    fromDashboard: true,
    resumable: false,
  },
  {
    cwd: '/repo/projet-c',
    sessionId: 'externe-1',
    title: 'Session externe',
    branch: null,
    lastActivity: '2026-09-15T10:00:00.000Z',
    fromDashboard: false,
    resumable: false,
  },
];

test('affiche les dossiers recents et les cartes de session apres chargement', async () => {
  render(<HomeScreen onOpen={() => {}} fetchSessions={async () => sessions} />);

  expect(await screen.findByText('projet-a')).toBeTruthy();
  expect(screen.getByText('projet-b')).toBeTruthy();
  expect(screen.getByText('projet-c')).toBeTruthy();
});

test('une session vivante se distingue d une session au repos', async () => {
  render(<HomeScreen onOpen={() => {}} fetchSessions={async () => sessions} />);
  await screen.findByText('projet-a');

  expect(screen.getByText(/vivant/i)).toBeTruthy();
  expect(screen.getAllByText(/repos/i).length).toBeGreaterThanOrEqual(1);
});

test('une session lancee hors du dashboard est annoncee non reprenable', async () => {
  render(<HomeScreen onOpen={() => {}} fetchSessions={async () => sessions} />);
  await screen.findByText('projet-c');

  const carte = screen.getByText('Session externe').closest('[data-session]')!;
  expect(carte.textContent).toMatch(/non reprenable/i);
});

test('cliquer une carte reprenable appelle onOpen', async () => {
  const onOpen = vi.fn();
  render(<HomeScreen onOpen={onOpen} fetchSessions={async () => sessions} />);
  await screen.findByText('Session en cours');

  fireEvent.click(screen.getByText('Session en cours'));
  expect(onOpen).toHaveBeenCalledWith({ cwd: '/repo/projet-a', sessionId: 'live-1' });
});

test('cliquer une carte non reprenable n appelle pas onOpen et ne plante pas', async () => {
  const onOpen = vi.fn();
  render(<HomeScreen onOpen={onOpen} fetchSessions={async () => sessions} />);
  await screen.findByText('Session externe');

  fireEvent.click(screen.getByText('Session externe'));
  expect(onOpen).not.toHaveBeenCalled();
});

test('le champ de filtre restreint aux dossiers correspondants', async () => {
  render(<HomeScreen onOpen={() => {}} fetchSessions={async () => sessions} />);
  await screen.findByText('projet-a');

  fireEvent.change(screen.getByLabelText('Ouvrir un dossier'), { target: { value: 'projet-b' } });

  expect(screen.queryByText('projet-a')).toBeNull();
  expect(screen.getByText('projet-b')).toBeTruthy();
});

test('un echec de chargement rend une liste vide sans planter', async () => {
  render(<HomeScreen onOpen={() => {}} fetchSessions={async () => { throw new Error('boom'); }} />);

  await waitFor(() => expect(screen.queryByText(/chargement/i)).toBeNull());
  expect(screen.queryByText('projet-a')).toBeNull();
});
