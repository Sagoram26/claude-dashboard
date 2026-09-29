import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listPrompts, loadPrompt, savePrompt, deletePrompt } from './store.ts';
import type { PromptDefinition } from '../protocol.ts';

const scratch = () => mkdtemp(join(tmpdir(), 'cd-prompts-'));

const prompt = (over: Partial<PromptDefinition> = {}): PromptDefinition => ({
  id: 'p1',
  name: 'Mon prompt',
  text: 'Fais X',
  pinned: false,
  ...over,
});

test('sauvegarder puis lister rend le prompt sauvegarde', async () => {
  const dir = await scratch();
  await savePrompt(dir, prompt());

  const prompts = await listPrompts(dir);

  assert.equal(prompts.length, 1);
  assert.equal(prompts[0]?.id, 'p1');
  assert.equal(prompts[0]?.name, 'Mon prompt');
});

test('sauvegarder puis charger par id rend le meme objet', async () => {
  const dir = await scratch();
  await savePrompt(dir, prompt());

  const loaded = await loadPrompt(dir, 'p1');

  assert.deepEqual(loaded, prompt());
});

test('charger un id inexistant rend null', async () => {
  const dir = await scratch();
  const loaded = await loadPrompt(dir, 'jamais-cree');
  assert.equal(loaded, null);
});

test('lister un repertoire qui n existe pas encore rend une liste vide', async () => {
  const prompts = await listPrompts(join(tmpdir(), 'jamais-cree-' + Date.now()));
  assert.deepEqual(prompts, []);
});

test('supprimer un prompt puis le charger rend null', async () => {
  const dir = await scratch();
  await savePrompt(dir, prompt());

  await deletePrompt(dir, 'p1');
  const loaded = await loadPrompt(dir, 'p1');

  assert.equal(loaded, null);
});

test('le fichier ecrit sur disque est du JSON lisible', async () => {
  const dir = await scratch();
  await savePrompt(dir, prompt());

  const raw = await readFile(join(dir, 'p1.json'), 'utf8');
  const parsed = JSON.parse(raw);

  assert.equal(parsed.id, 'p1');
  assert.equal(parsed.name, 'Mon prompt');
  assert.equal(parsed.text, 'Fais X');
});

test('sauvegarder un prompt epingle puis le lister restitue pinned a true', async () => {
  const dir = await scratch();
  await savePrompt(dir, prompt({ id: 'p2', pinned: true }));

  const prompts = await listPrompts(dir);

  assert.equal(prompts.find((p) => p.id === 'p2')?.pinned, true);
});
