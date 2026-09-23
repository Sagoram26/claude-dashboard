import { test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApprovalBlock } from './ApprovalBlock.tsx';
import type { ApprovalEntry } from '../state.ts';

const entry = (over: Partial<ApprovalEntry['request']> = {}, decision: ApprovalEntry['decision'] = null): ApprovalEntry => ({
  kind: 'approval',
  id: 'r1',
  decision,
  request: {
    requestId: 'r1',
    toolUseId: 'tu1',
    toolName: 'Bash',
    input: { command: 'rm -rf build' },
    canAlwaysAllow: true,
    defaultToNo: false,
    ...over,
  },
});

test('le titre du SDK est affiche tel quel', () => {
  render(<ApprovalBlock entry={entry({ title: 'Claude veut lancer rm -rf build' })} onDecide={() => {}} />);
  expect(screen.getByText('Claude veut lancer rm -rf build')).toBeTruthy();
});

test('sans titre, le nom de l outil sert de repli', () => {
  render(<ApprovalBlock entry={entry()} onDecide={() => {}} />);
  expect(screen.getByText(/Bash/)).toBeTruthy();
});

test('le contenu exact soumis a approbation est affiche', () => {
  render(<ApprovalBlock entry={entry({ input: { command: 'rm -rf build' } })} onDecide={() => {}} />);
  expect(screen.getByText('rm -rf build')).toBeTruthy();
});

test('les champs au-dela du champ principal restent visibles, jamais masques', () => {
  render(
    <ApprovalBlock
      entry={entry({
        input: { command: 'rm -rf build', dangerouslyDisableSandbox: true, timeout: 5000 },
      })}
      onDecide={() => {}}
    />
  );
  expect(screen.getByText('rm -rf build')).toBeTruthy();
  expect(screen.getByText(/dangerouslyDisableSandbox/)).toBeTruthy();
  expect(screen.getByText(/timeout/)).toBeTruthy();
});

test('quand path et pattern coexistent, aucun des deux n est masque', () => {
  render(
    <ApprovalBlock
      entry={entry({ toolName: 'Grep', input: { path: 'src', pattern: 'TODO' } })}
      onDecide={() => {}}
    />
  );
  expect(screen.getByText('src')).toBeTruthy();
  expect(screen.getByText(/TODO/)).toBeTruthy();
});

test('un Edit montre son chemin et son diff', () => {
  render(
    <ApprovalBlock
      entry={entry({
        toolName: 'Edit',
        input: { file_path: 'src/api.ts', old_string: 'const a = 1', new_string: 'const a = 2' },
      })}
      onDecide={() => {}}
    />
  );
  expect(screen.getByText(/src\/api\.ts/)).toBeTruthy();
  expect(screen.getByText(/-\s*const a = 1/)).toBeTruthy();
  expect(screen.getByText(/\+\s*const a = 2/)).toBeTruthy();
});

test('les trois actions sont presentes et remontent leur decision', () => {
  const decisions: string[] = [];
  render(<ApprovalBlock entry={entry()} onDecide={(d) => decisions.push(d)} />);

  fireEvent.click(screen.getByRole('button', { name: /^autoriser/i }));
  fireEvent.click(screen.getByRole('button', { name: /toujours/i }));
  expect(decisions).toEqual(['allow', 'always']);
});

test('refuser ouvre un champ de raison, transmise avec le refus', () => {
  const calls: [string, string | undefined][] = [];
  render(<ApprovalBlock entry={entry()} onDecide={(d, reason) => calls.push([d, reason])} />);

  fireEvent.click(screen.getByRole('button', { name: /refuser/i }));
  fireEvent.change(screen.getByLabelText(/raison/i), { target: { value: 'build est suivi par git' } });
  fireEvent.click(screen.getByRole('button', { name: /envoyer le refus/i }));

  expect(calls).toEqual([['deny', 'build est suivi par git']]);
});

test('le bouton toujours disparait quand canAlwaysAllow est faux', () => {
  render(<ApprovalBlock entry={entry({ canAlwaysAllow: false })} onDecide={() => {}} />);
  expect(screen.queryByRole('button', { name: /toujours/i })).toBeNull();
});

test('defaultToNo supprime le raccourci d approbation', () => {
  const { rerender } = render(<ApprovalBlock entry={entry({ defaultToNo: false })} onDecide={() => {}} />);
  expect(screen.getByRole('button', { name: /^autoriser/i }).textContent).toMatch(/a/i);

  rerender(<ApprovalBlock entry={entry({ defaultToNo: true })} onDecide={() => {}} />);
  const autoriser = screen.getByRole('button', { name: /^autoriser/i });
  expect(autoriser.querySelector('[data-shortcut]')).toBeNull();
});

test('une demande tranchee garde sa trace et perd ses actions', () => {
  render(<ApprovalBlock entry={entry({}, 'allow')} onDecide={() => {}} />);
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.getByText(/autorisé/i)).toBeTruthy();
});

test('un nom de serveur MCP hostile est rendu comme du texte, jamais comme du balisage', () => {
  const { container } = render(
    <ApprovalBlock
      entry={entry({ toolName: 'mcp__x__y', mcpServer: { name: '<img src=x onerror=alert(1)>', source: 'project' } })}
      onDecide={() => {}}
    />
  );
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText(/<img src=x onerror=alert\(1\)>/)).toBeTruthy();
});
