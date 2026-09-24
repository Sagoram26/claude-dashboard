import { test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ControlMenu } from './ControlMenu.tsx';

const options = [
  { value: 'low', label: 'low' },
  { value: 'high', label: 'high' },
];

test('la valeur courante est affichee sur le declencheur', () => {
  render(<ControlMenu label="Effort" options={options} value="high" onSelect={() => {}} />);
  expect(screen.getByRole('button', { name: /high/ })).toBeTruthy();
});

test('la liste est repliee par defaut', () => {
  render(<ControlMenu label="Effort" options={options} value="high" onSelect={() => {}} />);
  expect(screen.queryByRole('listbox')).toBeNull();
});

test('ouvrir puis choisir remonte la valeur et referme', () => {
  const choisis: string[] = [];
  render(<ControlMenu label="Effort" options={options} value="high" onSelect={(v) => choisis.push(v)} />);

  fireEvent.click(screen.getByRole('button', { name: /high/ }));
  fireEvent.click(screen.getByRole('option', { name: 'low' }));

  expect(choisis).toEqual(['low']);
  expect(screen.queryByRole('listbox')).toBeNull();
});

test('sans valeur connue, le declencheur porte le nom du reglage', () => {
  render(<ControlMenu label="Modèle" options={[]} value={null} onSelect={() => {}} />);
  expect(screen.getByRole('button', { name: /Modèle/ })).toBeTruthy();
});

test('un menu sans option ne s ouvre pas', () => {
  render(<ControlMenu label="Modèle" options={[]} value={null} onSelect={() => {}} />);
  fireEvent.click(screen.getByRole('button'));
  expect(screen.queryByRole('listbox')).toBeNull();
});

test('le mode manuel se signale, un mode permissif reste discret', () => {
  const modes = [{ value: 'default', label: 'default' }, { value: 'acceptEdits', label: 'acceptEdits' }];
  const { rerender } = render(
    <ControlMenu label="Mode" options={modes} value="default" onSelect={() => {}} tone="warn" />
  );
  expect(screen.getByRole('button').getAttribute('data-tone')).toBe('warn');

  rerender(<ControlMenu label="Mode" options={modes} value="acceptEdits" onSelect={() => {}} />);
  expect(screen.getByRole('button').getAttribute('data-tone')).toBe('neutral');
});
