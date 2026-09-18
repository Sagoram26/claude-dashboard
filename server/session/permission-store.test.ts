import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPermissionStore } from './permission-store.ts';

const scratch = () => mkdtemp(join(tmpdir(), 'cd-perm-'));

test('accorder puis relire depuis le disque', async () => {
  const dir = await scratch();

  const first = await createPermissionStore(dir);
  assert.deepEqual(first.list(), []);
  await first.grant('Bash');

  const second = await createPermissionStore(dir);
  assert.deepEqual(
    second.list().map((g) => g.toolName),
    ['Bash']
  );
  assert.equal(second.isGranted('Bash'), true);
  assert.equal(second.isGranted('Edit'), false);
});

test('accorder deux fois ne cree pas de doublon', async () => {
  const dir = await scratch();
  const store = await createPermissionStore(dir);
  await store.grant('Bash');
  await store.grant('Bash');
  assert.equal(store.list().length, 1);
});

test('revoquer retire du disque', async () => {
  const dir = await scratch();
  const store = await createPermissionStore(dir);
  await store.grant('Bash');
  await store.revoke('Bash');

  const relu = await createPermissionStore(dir);
  assert.deepEqual(relu.list(), []);
});

test('revoquer ce qui n a jamais ete accorde ne casse rien', async () => {
  const dir = await scratch();
  const store = await createPermissionStore(dir);
  await assert.doesNotReject(() => store.revoke('jamais'));
});

test('le fichier est du JSON lisible et editable a la main', async () => {
  const dir = await scratch();
  const store = await createPermissionStore(dir);
  await store.grant('Read');

  const brut = await readFile(join(dir, '.claude-dashboard', 'permissions.json'), 'utf8');
  assert.match(brut, /\n/, 'le fichier doit etre indente, pas sur une ligne');
  const parse = JSON.parse(brut);
  assert.equal(parse.granted[0].toolName, 'Read');
  assert.ok(typeof parse.granted[0].grantedAt === 'string');
});

test('un fichier corrompu ne fait pas tomber le serveur', async () => {
  const dir = await scratch();
  await mkdir(join(dir, '.claude-dashboard'), { recursive: true });
  await writeFile(join(dir, '.claude-dashboard', 'permissions.json'), '{ ceci n est pas du json');

  const store = await createPermissionStore(dir);
  assert.deepEqual(store.list(), [], 'un fichier illisible repart de zero plutot que de faire tomber');
});

test('un fichier valide mais de forme inattendue repart de zero', async () => {
  const dir = await scratch();
  await mkdir(join(dir, '.claude-dashboard'), { recursive: true });
  await writeFile(join(dir, '.claude-dashboard', 'permissions.json'), '{"granted": "pas un tableau"}');

  const store = await createPermissionStore(dir);
  assert.deepEqual(store.list(), []);
});
