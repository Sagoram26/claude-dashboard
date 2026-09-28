import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listWorkflows, loadWorkflow, saveWorkflow, deleteWorkflow } from './store.ts';
import type { WorkflowDefinition } from '../protocol.ts';

const scratch = () => mkdtemp(join(tmpdir(), 'cd-workflows-'));

const workflow = (over: Partial<WorkflowDefinition> = {}): WorkflowDefinition => ({
  id: 'w1',
  name: 'Mon workflow',
  steps: [
    { id: 's1', label: 'Etape 1', prompt: 'Fais X', gate: false },
  ],
  ...over,
});

test('sauvegarder puis lister rend le workflow sauvegarde', async () => {
  const dir = await scratch();
  await saveWorkflow(dir, workflow());

  const workflows = await listWorkflows(dir);

  assert.equal(workflows.length, 1);
  assert.equal(workflows[0]?.id, 'w1');
  assert.equal(workflows[0]?.name, 'Mon workflow');
});

test('sauvegarder puis charger par id rend le meme objet', async () => {
  const dir = await scratch();
  await saveWorkflow(dir, workflow());

  const loaded = await loadWorkflow(dir, 'w1');

  assert.deepEqual(loaded, workflow());
});

test('charger un id inexistant rend null', async () => {
  const dir = await scratch();
  const loaded = await loadWorkflow(dir, 'jamais-cree');
  assert.equal(loaded, null);
});

test('lister un repertoire qui n existe pas encore rend une liste vide', async () => {
  const workflows = await listWorkflows(join(tmpdir(), 'jamais-cree-' + Date.now()));
  assert.deepEqual(workflows, []);
});

test('supprimer un workflow puis le charger rend null', async () => {
  const dir = await scratch();
  await saveWorkflow(dir, workflow());

  await deleteWorkflow(dir, 'w1');
  const loaded = await loadWorkflow(dir, 'w1');

  assert.equal(loaded, null);
});

test('le fichier ecrit sur disque est du JSON lisible', async () => {
  const dir = await scratch();
  await saveWorkflow(dir, workflow());

  const raw = await readFile(join(dir, 'w1.json'), 'utf8');
  const parsed = JSON.parse(raw);

  assert.equal(parsed.id, 'w1');
  assert.equal(parsed.name, 'Mon workflow');
  assert.equal(parsed.steps[0].label, 'Etape 1');
});
