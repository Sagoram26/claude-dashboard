import { test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
