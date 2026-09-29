import { test, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Sidebar } from './Sidebar.tsx';
import type { PromptDefinition, WorkflowDefinition } from '../../../server/protocol.ts';

beforeEach(() => {
  localStorage.clear();
});

const base = {
  column: 'accueil' as const,
  onSelectColumn: () => {},
  changedFiles: [{ path: 'src/a.ts', added: 3, removed: 1 }],
  toolActivityCount: 2,
  availableCommands: [{ name: 'commit', description: 'ecrit un commit' }],
  mcpServers: [{ name: 'linear', status: 'connected', toolCount: 3 }],
  availableAgents: [{ name: 'Explore', description: 'recherche en lecture seule' }],
  prompts: [] as PromptDefinition[],
  onLaunchPrompt: () => {},
  onSavePrompt: () => {},
  onDeletePrompt: () => {},
  onTogglePinPrompt: () => {},
  workflows: [] as WorkflowDefinition[],
  availableModels: [] as { value: string; displayName: string }[],
  onSaveWorkflow: () => {},
  onDeleteWorkflow: () => {},
  onLaunchWorkflow: () => {},
};

test('trois icones selectionnent la colonne', () => {
  const selected: string[] = [];
  render(<Sidebar {...base} onSelectColumn={(c) => selected.push(c)} />);

  fireEvent.click(screen.getByRole('button', { name: /skills/i }));
  fireEvent.click(screen.getByRole('button', { name: /lancer/i }));

  expect(selected).toEqual(['skills', 'lancer']);
});

test('colonne accueil affiche les fichiers modifies avec leur delta et un total', () => {
  render(<Sidebar {...base} />);

  expect(screen.getByText(/1/)).toBeTruthy(); // total en en-tete
  expect(screen.getByText('src/a.ts')).toBeTruthy();
  expect(screen.getByText(/\+3/)).toBeTruthy();
  expect(screen.getByText(/-1|−1/)).toBeTruthy();
});

test('la section Activite est repliee par defaut avec un compteur', () => {
  render(<Sidebar {...base} />);

  const toggle = screen.getByRole('button', { name: /activit/i });
  expect(toggle.textContent).toContain('2');
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
});

test('deplier une section persiste son etat au remontage', () => {
  const { unmount } = render(<Sidebar {...base} />);
  fireEvent.click(screen.getByRole('button', { name: /activit/i }));
  expect(screen.getByRole('button', { name: /activit/i }).getAttribute('aria-expanded')).toBe('true');
  unmount();

  render(<Sidebar {...base} />);
  expect(screen.getByRole('button', { name: /activit/i }).getAttribute('aria-expanded')).toBe('true');
});

test('colonne skills et mcp : un serveur hors ligne reste visible avec son statut', () => {
  render(
    <Sidebar
      {...base}
      column="skills"
      mcpServers={[{ name: 'linear', status: 'failed', toolCount: 0, error: 'timeout' }]}
    />
  );

  const section = screen.getByText('linear').closest('div')!;
  expect(within(section.parentElement!).getByText(/failed/)).toBeTruthy();
});

test('colonne lancer : les subagents sont listes et le fan-out est desactive', () => {
  render(<Sidebar {...base} column="lancer" />);

  expect(screen.getByText('Explore')).toBeTruthy();
  expect(screen.getByText(/fan-out/i)).toBeTruthy();
  expect(screen.getByText(/désactiv|desactiv/i)).toBeTruthy();
});

test('colonne lancer : la section prompts affiche la bibliotheque de prompts', () => {
  const launched: PromptDefinition[] = [];
  render(
    <Sidebar
      {...base}
      column="lancer"
      prompts={[{ id: 'p1', name: 'Mon prompt', text: 'Fais X', pinned: false }]}
      onLaunchPrompt={(p) => launched.push(p)}
    />
  );

  expect(screen.getByDisplayValue('Mon prompt')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /^lancer$/i }));
  expect(launched).toEqual([{ id: 'p1', name: 'Mon prompt', text: 'Fais X', pinned: false }]);
});

test('colonne accueil, section favoris : liste les prompts epingles en lecture seule avec un bouton lancer', () => {
  const launched: PromptDefinition[] = [];
  render(
    <Sidebar
      {...base}
      prompts={[
        { id: 'p1', name: 'Prompt epingle', text: 'X', pinned: true },
        { id: 'p2', name: 'Prompt normal', text: 'Y', pinned: false },
      ]}
      onLaunchPrompt={(p) => launched.push(p)}
    />
  );

  expect(screen.getByText('Prompt epingle')).toBeTruthy();
  expect(screen.queryByText('Prompt normal')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: /^lancer$/i }));
  expect(launched).toEqual([{ id: 'p1', name: 'Prompt epingle', text: 'X', pinned: true }]);
});

test('colonne accueil, section favoris : aucun favori epingle garde le texte Aucun favori', () => {
  render(<Sidebar {...base} prompts={[{ id: 'p1', name: 'Prompt normal', text: 'Y', pinned: false }]} />);

  expect(screen.getByText('Aucun favori')).toBeTruthy();
});

test('colonne lancer : la section workflows liste les workflows et permet de les lancer', () => {
  const launched: string[] = [];
  render(
    <Sidebar
      {...base}
      column="lancer"
      workflows={[{ id: 'w1', name: 'Mon workflow', steps: [] }]}
      onLaunchWorkflow={(id) => launched.push(id)}
    />
  );

  expect(screen.getAllByText('Mon workflow').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: /^lancer$/i }));
  expect(launched).toEqual(['w1']);
});

test('colonne lancer : le WorkflowEditor est monte avec les workflows fournis', () => {
  render(<Sidebar {...base} column="lancer" workflows={[{ id: 'w1', name: 'Mon workflow', steps: [] }]} />);

  expect(screen.getByRole('button', { name: /nouveau workflow/i })).toBeTruthy();
});
