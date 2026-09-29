import { test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Conversation } from './Conversation.tsx';
import type { CheckpointEntry } from '../state.ts';
import type { WorkflowCheckpoint } from '../../../server/protocol.ts';

const checkpoint = (over: Partial<WorkflowCheckpoint> = {}): WorkflowCheckpoint => ({
  id: 's1',
  label: 'Étape 1',
  status: 'running',
  stepIndex: 0,
  totalSteps: 2,
  gate: false,
  ...over,
});

const checkpointEntry = (over: Partial<WorkflowCheckpoint> = {}): CheckpointEntry => {
  const cp = checkpoint(over);
  return { kind: 'checkpoint', id: `${cp.id}-${cp.status}`, checkpoint: cp };
};

test('un checkpoint running affiche une ligne discrète', () => {
  render(
    <Conversation
      thread={[checkpointEntry({ status: 'running' })]}
      error={null}
      onDecide={() => {}}
      onWorkflowGateAction={() => {}}
    />
  );
  expect(screen.getByText('▸ Étape 1')).toBeTruthy();
});

test('un checkpoint done affiche sa durée', () => {
  render(
    <Conversation
      thread={[checkpointEntry({ status: 'done', durationMs: 4200 })]}
      error={null}
      onDecide={() => {}}
      onWorkflowGateAction={() => {}}
    />
  );
  expect(screen.getByText(/✓ Étape 1/)).toBeTruthy();
  expect(screen.getByText(/4s/)).toBeTruthy();
});

test('un checkpoint gate affiche un bloc avec deux actions', () => {
  render(
    <Conversation
      thread={[checkpointEntry({ status: 'gate' })]}
      error={null}
      onDecide={() => {}}
      onWorkflowGateAction={() => {}}
    />
  );
  expect(screen.getByText(/Étape 1 — barrière/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Continuer' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Corriger' })).toBeTruthy();
});

test('cliquer sur Continuer appelle onWorkflowGateAction avec continue', () => {
  const calls: [string, 'continue' | 'correct'][] = [];
  render(
    <Conversation
      thread={[checkpointEntry({ status: 'gate', id: 's2' })]}
      error={null}
      onDecide={() => {}}
      onWorkflowGateAction={(id, action) => calls.push([id, action])}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
  expect(calls).toEqual([['s2', 'continue']]);
});

test('cliquer sur Corriger appelle onWorkflowGateAction avec correct', () => {
  const calls: [string, 'continue' | 'correct'][] = [];
  render(
    <Conversation
      thread={[checkpointEntry({ status: 'gate', id: 's2' })]}
      error={null}
      onDecide={() => {}}
      onWorkflowGateAction={(id, action) => calls.push([id, action])}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Corriger' }));
  expect(calls).toEqual([['s2', 'correct']]);
});
