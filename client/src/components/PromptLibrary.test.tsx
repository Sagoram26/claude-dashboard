import { test, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PromptLibrary } from './PromptLibrary.tsx';
import type { PromptDefinition } from '../../../server/protocol.ts';

const prompt = (over: Partial<PromptDefinition> = {}): PromptDefinition => ({
  id: 'p1',
  name: 'Mon prompt',
  text: 'Fais X',
  pinned: false,
  ...over,
});

test('liste tous les prompts par nom, avec un bouton Lancer par prompt', () => {
  const launched: PromptDefinition[] = [];
  render(
    <PromptLibrary
      prompts={[prompt(), prompt({ id: 'p2', name: 'Autre prompt' })]}
      onLaunch={(p) => launched.push(p)}
      onSave={() => {}}
      onDelete={() => {}}
      onTogglePin={() => {}}
    />
  );

  expect(screen.getByDisplayValue('Mon prompt')).toBeTruthy();
  expect(screen.getByDisplayValue('Autre prompt')).toBeTruthy();

  const launchButtons = screen.getAllByRole('button', { name: /^lancer$/i });
  expect(launchButtons).toHaveLength(2);
  fireEvent.click(launchButtons[0]!);

  expect(launched).toEqual([prompt()]);
});

test('le bouton Nouveau prompt ajoute une entree editable non epinglee par defaut', () => {
  render(
    <PromptLibrary prompts={[]} onLaunch={() => {}} onSave={() => {}} onDelete={() => {}} onTogglePin={() => {}} />
  );

  fireEvent.click(screen.getByRole('button', { name: /nouveau prompt/i }));

  expect(screen.getByLabelText(/nom du prompt/i)).toBeTruthy();
  expect(screen.getByLabelText(/texte du prompt/i)).toBeTruthy();
  expect(screen.getByRole('button', { name: /épingler/i }).getAttribute('aria-pressed')).toBe('false');
});

test('editer le texte puis Enregistrer appelle onSave avec le texte modifie', () => {
  const saved: PromptDefinition[] = [];
  render(
    <PromptLibrary
      prompts={[prompt()]}
      onLaunch={() => {}}
      onSave={(p) => saved.push(p)}
      onDelete={() => {}}
      onTogglePin={() => {}}
    />
  );

  fireEvent.change(screen.getByLabelText(/texte du prompt/i), { target: { value: 'Fais Y a la place' } });
  fireEvent.click(screen.getByRole('button', { name: /^enregistrer$/i }));

  expect(saved).toHaveLength(1);
  expect(saved[0]?.text).toBe('Fais Y a la place');
});

test('le bouton epingle appelle onTogglePin avec le bon id', () => {
  const toggled: string[] = [];
  render(
    <PromptLibrary
      prompts={[prompt()]}
      onLaunch={() => {}}
      onSave={() => {}}
      onDelete={() => {}}
      onTogglePin={(id) => toggled.push(id)}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: /épingler/i }));

  expect(toggled).toEqual(['p1']);
});

// I4 : useState(prop) figeait les brouillons a la valeur initiale ; "Supprimer" laissait la carte
// affichee jusqu'au prochain montage, l'etoile d'epinglage ne se mettait pas a jour apres un
// prompts.list recu du serveur.
test('les brouillons se resynchronisent quand la prop prompts change (I4)', () => {
  const { rerender } = render(
    <PromptLibrary
      prompts={[prompt()]}
      onLaunch={() => {}}
      onSave={() => {}}
      onDelete={() => {}}
      onTogglePin={() => {}}
    />
  );

  expect(screen.getByDisplayValue('Mon prompt')).toBeTruthy();

  rerender(
    <PromptLibrary
      prompts={[prompt({ id: 'p2', name: 'Prompt externe' })]}
      onLaunch={() => {}}
      onSave={() => {}}
      onDelete={() => {}}
      onTogglePin={() => {}}
    />
  );

  expect(screen.queryByDisplayValue('Mon prompt')).toBeNull();
  expect(screen.getByDisplayValue('Prompt externe')).toBeTruthy();
});

test('Supprimer appelle onDelete avec le bon id', () => {
  const deleted: string[] = [];
  render(
    <PromptLibrary
      prompts={[prompt()]}
      onLaunch={() => {}}
      onSave={() => {}}
      onDelete={(id) => deleted.push(id)}
      onTogglePin={() => {}}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: /supprimer/i }));

  expect(deleted).toEqual(['p1']);
});
