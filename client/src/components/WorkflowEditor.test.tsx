import { test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkflowEditor } from './WorkflowEditor.tsx';
import type { WorkflowDefinition } from '../../../server/protocol.ts';

const availableModels = [
  { value: 'claude-sonnet-5', displayName: 'Sonnet 5' },
  { value: 'claude-opus-4', displayName: 'Opus 4' },
];

const availableAgents = [
  { name: 'reviewer', description: 'Relit le code' },
  { name: 'tester', description: 'Ecrit les tests' },
];

const workflow = (over: Partial<WorkflowDefinition> = {}): WorkflowDefinition => ({
  id: 'w1',
  name: 'Mon workflow',
  steps: [{ id: 's1', label: 'Etape 1', prompt: 'Fais X', gate: false }],
  ...over,
});

test('liste les workflows existants par nom', () => {
  render(
    <WorkflowEditor
      workflows={[workflow(), workflow({ id: 'w2', name: 'Autre workflow' })]}
      availableModels={availableModels}
      availableAgents={availableAgents}
      onSave={() => {}}
      onDelete={() => {}}
    />
  );

  expect(screen.getByText('Mon workflow')).toBeTruthy();
  expect(screen.getByText('Autre workflow')).toBeTruthy();
});

test('le bouton nouveau workflow ajoute une entree editable avec au moins une etape vide', () => {
  render(
    <WorkflowEditor
      workflows={[]}
      availableModels={availableModels}
      availableAgents={availableAgents}
      onSave={() => {}}
      onDelete={() => {}}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: /nouveau workflow/i }));

  expect(screen.getByRole('checkbox', { name: /barrière/i })).toBeTruthy();
});

test('chaque etape affiche un champ modele, un champ subagent optionnel et une case barriere', () => {
  render(
    <WorkflowEditor
      workflows={[workflow()]}
      availableModels={availableModels}
      availableAgents={availableAgents}
      onSave={() => {}}
      onDelete={() => {}}
    />
  );

  expect(screen.getByRole('combobox', { name: /modèle/i })).toBeTruthy();
  const subagentSelect = screen.getByRole('combobox', { name: /subagent/i }) as HTMLSelectElement;
  const optionValues = Array.from(subagentSelect.options).map((o) => o.value);
  expect(optionValues).toContain('');
  expect(optionValues).toContain('reviewer');
  expect(optionValues).toContain('tester');
  expect(screen.getByRole('checkbox', { name: /barrière/i })).toBeTruthy();
});

test('cocher la case barriere puis sauvegarder appelle onSave avec gate a true', () => {
  const saved: WorkflowDefinition[] = [];
  render(
    <WorkflowEditor
      workflows={[workflow()]}
      availableModels={availableModels}
      availableAgents={availableAgents}
      onSave={(w) => saved.push(w)}
      onDelete={() => {}}
    />
  );

  fireEvent.click(screen.getByRole('checkbox', { name: /barrière/i }));
  fireEvent.click(screen.getByRole('button', { name: /^enregistrer$/i }));

  expect(saved).toHaveLength(1);
  expect(saved[0]?.steps[0]?.gate).toBe(true);
});

test('modifier le prompt d une etape puis sauvegarder appelle onSave avec le prompt attendu', () => {
  const saved: WorkflowDefinition[] = [];
  render(
    <WorkflowEditor
      workflows={[workflow()]}
      availableModels={availableModels}
      availableAgents={availableAgents}
      onSave={(w) => saved.push(w)}
      onDelete={() => {}}
    />
  );

  fireEvent.change(screen.getByLabelText(/prompt/i), { target: { value: 'Fais Y a la place' } });
  fireEvent.click(screen.getByRole('button', { name: /^enregistrer$/i }));

  expect(saved).toHaveLength(1);
  expect(saved[0]?.steps[0]?.prompt).toBe('Fais Y a la place');
});

test('supprimer un workflow appelle onDelete avec le bon id', () => {
  const deleted: string[] = [];
  render(
    <WorkflowEditor
      workflows={[workflow()]}
      availableModels={availableModels}
      availableAgents={availableAgents}
      onSave={() => {}}
      onDelete={(id) => deleted.push(id)}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: /supprimer/i }));

  expect(deleted).toEqual(['w1']);
});
