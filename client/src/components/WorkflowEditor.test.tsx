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

test('chaque etape affiche un champ modele, un champ mode de permission et une case barriere', () => {
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
  const modeSelect = screen.getByRole('combobox', { name: /mode de permission/i }) as HTMLSelectElement;
  const optionValues = Array.from(modeSelect.options).map((o) => o.value);
  expect(optionValues).toContain('');
  expect(optionValues).toContain('default');
  expect(optionValues).toContain('acceptEdits');
  expect(optionValues).toContain('plan');
  expect(optionValues).toContain('dontAsk');
  expect(optionValues).toContain('auto');
  expect(screen.getByRole('checkbox', { name: /barrière/i })).toBeTruthy();
});

// I5, option (a) : le choix de subagent par etape n'est transmis nulle part cote executeur
// (server/workflows/executor.ts ne lit que model/permissionMode) ; retire le select trompeur.
test('aucun champ subagent n est affiche par etape (I5, option a)', () => {
  render(
    <WorkflowEditor
      workflows={[workflow()]}
      availableModels={availableModels}
      availableAgents={availableAgents}
      onSave={() => {}}
      onDelete={() => {}}
    />
  );

  expect(screen.queryByRole('combobox', { name: /subagent/i })).toBeNull();
});

test('choisir un mode de permission par etape puis sauvegarder le transmet a onSave', () => {
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

  fireEvent.change(screen.getByRole('combobox', { name: /mode de permission/i }), {
    target: { value: 'plan' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^enregistrer$/i }));

  expect(saved).toHaveLength(1);
  expect(saved[0]?.steps[0]?.permissionMode).toBe('plan');
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

// B1 : emptyWorkflow() ne créait qu'une seule étape, sans moyen d'en ajouter/retirer après coup.
test('le bouton Ajouter une etape ajoute une etape supplementaire', () => {
  render(
    <WorkflowEditor
      workflows={[workflow()]}
      availableModels={availableModels}
      availableAgents={availableAgents}
      onSave={() => {}}
      onDelete={() => {}}
    />
  );

  expect(screen.getAllByLabelText(/nom de l'étape/i)).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: /ajouter une étape/i }));
  expect(screen.getAllByLabelText(/nom de l'étape/i)).toHaveLength(2);
});

test('le bouton Retirer supprime une etape, sans jamais descendre sous une etape', () => {
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

  fireEvent.click(screen.getByRole('button', { name: /ajouter une étape/i }));
  expect(screen.getAllByLabelText(/nom de l'étape/i)).toHaveLength(2);

  const retirer = screen.getAllByRole('button', { name: /retirer/i });
  fireEvent.click(retirer[0]!);
  expect(screen.getAllByLabelText(/nom de l'étape/i)).toHaveLength(1);

  // Une seule étape restante : le bouton Retirer disparaît (ou est desactive) pour l'empêcher de
  // tomber à zéro étape.
  expect(screen.queryAllByRole('button', { name: /retirer/i })).toHaveLength(0);

  fireEvent.click(screen.getByRole('button', { name: /^enregistrer$/i }));
  expect(saved[0]?.steps).toHaveLength(1);
});

test('un input Nom du workflow est editable et transmis a onSave', () => {
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

  fireEvent.change(screen.getByLabelText(/nom du workflow/i), { target: { value: 'Nom modifie' } });
  fireEvent.click(screen.getByRole('button', { name: /^enregistrer$/i }));

  expect(saved).toHaveLength(1);
  expect(saved[0]?.name).toBe('Nom modifie');
});

// I4 : useState(prop) figeait les brouillons a la valeur initiale ; une mise a jour externe
// (workflows.list recu du serveur apres un save/delete ailleurs) ne se reflète jamais.
test('les brouillons se resynchronisent quand la prop workflows change (I4)', () => {
  const { rerender } = render(
    <WorkflowEditor
      workflows={[workflow()]}
      availableModels={availableModels}
      availableAgents={availableAgents}
      onSave={() => {}}
      onDelete={() => {}}
    />
  );

  expect(screen.getByText('Mon workflow')).toBeTruthy();

  rerender(
    <WorkflowEditor
      workflows={[workflow({ id: 'w2', name: 'Workflow externe' })]}
      availableModels={availableModels}
      availableAgents={availableAgents}
      onSave={() => {}}
      onDelete={() => {}}
    />
  );

  expect(screen.queryByText('Mon workflow')).toBeNull();
  expect(screen.getByText('Workflow externe')).toBeTruthy();
});
