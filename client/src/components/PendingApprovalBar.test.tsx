import { test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PendingApprovalBar } from './PendingApprovalBar.tsx';
import type { ApprovalEntry } from '../state.ts';

const pending = (id: string, toolName = 'Bash'): ApprovalEntry => ({
  kind: 'approval',
  id,
  decision: null,
  request: {
    requestId: id,
    toolUseId: `tu-${id}`,
    toolName,
    input: { command: 'ls' },
    canAlwaysAllow: true,
    defaultToNo: false,
  },
});

test('une seule demande nomme l outil', () => {
  render(<PendingApprovalBar pending={[pending('r1', 'Edit')]} onAllow={() => {}} onReveal={() => {}} />);
  expect(screen.getByRole('status').textContent).toMatch(/Edit/);
});

test('plusieurs demandes affichent leur nombre', () => {
  render(
    <PendingApprovalBar
      pending={[pending('r1'), pending('r2'), pending('r3')]}
      onAllow={() => {}}
      onReveal={() => {}}
    />
  );
  expect(screen.getByRole('status').textContent).toMatch(/3/);
});

test('autoriser porte sur la demande la plus ancienne', () => {
  const allowed: string[] = [];
  render(
    <PendingApprovalBar
      pending={[pending('r1'), pending('r2')]}
      onAllow={(id) => allowed.push(id)}
      onReveal={() => {}}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /autoriser/i }));
  expect(allowed).toEqual(['r1']);
});

test('voir la demande remonte au bloc correspondant', () => {
  const revealed: string[] = [];
  render(
    <PendingApprovalBar pending={[pending('r1')]} onAllow={() => {}} onReveal={(id) => revealed.push(id)} />
  );
  fireEvent.click(screen.getByRole('button', { name: /voir/i }));
  expect(revealed).toEqual(['r1']);
});

test('sans demande en attente, rien n est rendu', () => {
  const { container } = render(<PendingApprovalBar pending={[]} onAllow={() => {}} onReveal={() => {}} />);
  expect(container.firstChild).toBeNull();
});

test('le rappel est annonce aux lecteurs d ecran', () => {
  render(<PendingApprovalBar pending={[pending('r1')]} onAllow={() => {}} onReveal={() => {}} />);
  expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
});
