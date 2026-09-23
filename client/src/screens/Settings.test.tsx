import { test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Settings } from './Settings.tsx';

const granted = [
  { toolName: 'Bash', grantedAt: '2026-09-18T10:00:00.000Z' },
  { toolName: 'Read', grantedAt: '2026-09-18T10:05:00.000Z' },
];

test('les permissions accordees sont listees', () => {
  render(<Settings granted={granted} onRevoke={() => {}} onClose={() => {}} />);
  expect(screen.getByText('Bash')).toBeTruthy();
  expect(screen.getByText('Read')).toBeTruthy();
});

test('chaque permission a son bouton de revocation, qui nomme l outil', () => {
  const revoques: string[] = [];
  render(<Settings granted={granted} onRevoke={(t) => revoques.push(t)} onClose={() => {}} />);

  fireEvent.click(screen.getByRole('button', { name: /révoquer Bash/i }));
  expect(revoques).toEqual(['Bash']);
});

test('sans permission accordee, la section le dit au lieu d etre vide', () => {
  render(<Settings granted={[]} onRevoke={() => {}} onClose={() => {}} />);
  expect(screen.getByText(/aucune permission/i)).toBeTruthy();
});

test('les sections a venir sont annoncees avec leur tranche', () => {
  render(<Settings granted={[]} onRevoke={() => {}} onClose={() => {}} />);
  expect(screen.getByText(/serveurs mcp/i)).toBeTruthy();
  expect(screen.getByText(/workflows/i)).toBeTruthy();
  expect(screen.getAllByText(/à venir/i).length).toBeGreaterThan(0);
});

test('echap ferme l ecran', () => {
  let ferme = 0;
  render(<Settings granted={[]} onRevoke={() => {}} onClose={() => (ferme += 1)} />);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(ferme).toBe(1);
});

test('la date d octroi est affichee de maniere lisible', () => {
  render(<Settings granted={granted} onRevoke={() => {}} onClose={() => {}} />);
  expect(screen.getAllByText(/2026/).length).toBeGreaterThan(0);
});
