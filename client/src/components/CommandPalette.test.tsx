import { test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPalette } from './CommandPalette.tsx';
import type { PaletteItem } from './CommandPalette.tsx';

const item = (over: Partial<PaletteItem> = {}): PaletteItem => ({
  id: 'i1',
  type: 'skill',
  label: 'Un item',
  ...over,
});

test('open=false ne rend ni recherche ni liste', () => {
  render(<CommandPalette open={false} items={[item()]} onSelect={() => {}} onClose={() => {}} />);

  expect(screen.queryByRole('searchbox')).toBeNull();
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('open=true rend le champ de recherche et tous les items', () => {
  const items = [
    item({ id: 'p1', type: 'prompt', label: 'Prompt un' }),
    item({ id: 's1', type: 'skill', label: 'Skill un' }),
    item({ id: 'a1', type: 'subagent', label: 'Subagent un' }),
  ];
  render(<CommandPalette open={true} items={items} onSelect={() => {}} onClose={() => {}} />);

  expect(screen.getByLabelText(/rechercher une commande/i)).toBeTruthy();
  expect(screen.getByText('Prompt un')).toBeTruthy();
  expect(screen.getByText('Skill un')).toBeTruthy();
  expect(screen.getByText('Subagent un')).toBeTruthy();
});

test('la recherche filtre par sous-chaine insensible a la casse sur label et description, tous types confondus', () => {
  const items = [
    item({ id: 'p1', type: 'prompt', label: 'Deployer le PROJET', description: 'lance le deploiement' }),
    item({ id: 's1', type: 'skill', label: 'Skill sans rapport', description: 'rien a voir' }),
    item({ id: 'a1', type: 'subagent', label: 'Un agent', description: 'aide au deploiement' }),
  ];
  render(<CommandPalette open={true} items={items} onSelect={() => {}} onClose={() => {}} />);

  fireEvent.change(screen.getByLabelText(/rechercher une commande/i), { target: { value: 'deploi' } });

  expect(screen.getByText('Deployer le PROJET')).toBeTruthy();
  expect(screen.getByText('Un agent')).toBeTruthy();
  expect(screen.queryByText('Skill sans rapport')).toBeNull();
});

test('un meme terme de recherche trouve un prompt, un skill et un subagent (critere de fin point 7)', () => {
  const items = [
    item({ id: 'p1', type: 'prompt', label: 'Deployer via GITHUB', description: 'lance un deploiement' }),
    item({ id: 's1', type: 'skill', label: 'Skill github', description: 'interagit avec github' }),
    item({ id: 'a1', type: 'subagent', label: 'Un agent', description: 'gere les PR github' }),
  ];
  render(<CommandPalette open={true} items={items} onSelect={() => {}} onClose={() => {}} />);

  fireEvent.change(screen.getByLabelText(/rechercher une commande/i), { target: { value: 'github' } });

  expect(screen.getByText('Deployer via GITHUB')).toBeTruthy();
  expect(screen.getByText('Skill github')).toBeTruthy();
  expect(screen.getByText('Un agent')).toBeTruthy();
});

test('les onglets de type restreignent la liste, combines au filtre texte', () => {
  const items = [
    item({ id: 'p1', type: 'prompt', label: 'Alpha prompt' }),
    item({ id: 's1', type: 'skill', label: 'Alpha skill' }),
    item({ id: 'a1', type: 'subagent', label: 'Alpha subagent' }),
  ];
  render(<CommandPalette open={true} items={items} onSelect={() => {}} onClose={() => {}} />);

  fireEvent.click(screen.getByRole('button', { name: /^skills$/i }));

  expect(screen.queryByText('Alpha prompt')).toBeNull();
  expect(screen.getByText('Alpha skill')).toBeTruthy();
  expect(screen.queryByText('Alpha subagent')).toBeNull();

  fireEvent.change(screen.getByLabelText(/rechercher une commande/i), { target: { value: 'zzz-introuvable' } });
  expect(screen.queryByText('Alpha skill')).toBeNull();
});

test('cliquer un resultat appelle onSelect avec cet item', () => {
  const selected: PaletteItem[] = [];
  const items = [item({ id: 'p1', label: 'Cliquable' })];
  render(<CommandPalette open={true} items={items} onSelect={(i) => selected.push(i)} onClose={() => {}} />);

  fireEvent.click(screen.getByText('Cliquable'));

  expect(selected).toEqual([items[0]]);
});

test('Enter dans le champ de recherche appelle onSelect avec le premier resultat visible', () => {
  const selected: PaletteItem[] = [];
  const items = [
    item({ id: 'p1', type: 'prompt', label: 'Premier prompt' }),
    item({ id: 's1', type: 'skill', label: 'Deuxieme skill' }),
  ];
  render(<CommandPalette open={true} items={items} onSelect={(i) => selected.push(i)} onClose={() => {}} />);

  fireEvent.keyDown(screen.getByLabelText(/rechercher une commande/i), { key: 'Enter' });

  expect(selected).toEqual([items[0]]);
});

test('Enter selectionne le premier resultat de la liste filtree courante, pas le premier de la liste complete', () => {
  const selected: PaletteItem[] = [];
  const items = [
    item({ id: 'p1', type: 'prompt', label: 'Premier prompt' }),
    item({ id: 's1', type: 'skill', label: 'Deuxieme skill special' }),
  ];
  render(<CommandPalette open={true} items={items} onSelect={(i) => selected.push(i)} onClose={() => {}} />);

  fireEvent.change(screen.getByLabelText(/rechercher une commande/i), { target: { value: 'special' } });
  fireEvent.keyDown(screen.getByLabelText(/rechercher une commande/i), { key: 'Enter' });

  expect(selected).toEqual([items[1]]);
});

test('Escape appelle onClose', () => {
  const closed: boolean[] = [];
  render(
    <CommandPalette open={true} items={[item()]} onSelect={() => {}} onClose={() => closed.push(true)} />
  );

  fireEvent.keyDown(screen.getByLabelText(/rechercher une commande/i), { key: 'Escape' });

  expect(closed).toEqual([true]);
});

test('aucun resultat apres filtrage affiche un message dedie', () => {
  render(<CommandPalette open={true} items={[item({ label: 'Seul item' })]} onSelect={() => {}} onClose={() => {}} />);

  fireEvent.change(screen.getByLabelText(/rechercher une commande/i), { target: { value: 'zzz-introuvable' } });

  expect(screen.getByText(/aucun résultat/i)).toBeTruthy();
});
