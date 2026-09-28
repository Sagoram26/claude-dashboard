import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContextPopover } from './ContextPopover.tsx';

const usage = {
  totalTokens: 400,
  maxTokens: 1000,
  percentage: 40,
  categories: [
    { name: 'CLAUDE.md', tokens: 150 },
    { name: 'Messages', tokens: 250 },
  ],
};

test('ferme, le popover ne rend rien', () => {
  render(<ContextPopover open={false} usage={usage} onCompact={() => {}} onClose={() => {}} />);
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('ouvert, ventile la fenetre par origine avec la taille en tokens', () => {
  render(<ContextPopover open={true} usage={usage} onCompact={() => {}} onClose={() => {}} />);

  const dialog = screen.getByRole('dialog');
  expect(dialog.textContent).toContain('CLAUDE.md');
  expect(dialog.textContent).toContain('150');
  expect(dialog.textContent).toContain('Messages');
  expect(dialog.textContent).toContain('250');
});

test('sans donnee encore recue, aucun crash, pas de ventilation affichee', () => {
  render(<ContextPopover open={true} usage={null} onCompact={() => {}} onClose={() => {}} />);
  expect(screen.getByRole('dialog')).toBeDefined();
});

test('l action de compactage remonte au parent', () => {
  const onCompact = vi.fn();
  render(<ContextPopover open={true} usage={usage} onCompact={onCompact} onClose={() => {}} />);

  fireEvent.click(screen.getByRole('button', { name: /compact/i }));
  expect(onCompact).toHaveBeenCalledOnce();
});

test('fermer remonte au parent', () => {
  const onClose = vi.fn();
  render(<ContextPopover open={true} usage={usage} onCompact={() => {}} onClose={onClose} />);

  fireEvent.click(screen.getByRole('button', { name: /fermer/i }));
  expect(onClose).toHaveBeenCalledOnce();
});
