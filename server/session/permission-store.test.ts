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

test('un echec d ecriture sur grant ne met pas la memoire a jour', async () => {
  const dir = await scratch();
  const store = await createPermissionStore(dir);

  // Un dossier a la place du fichier fait echouer `writeFile` (EISDIR) de facon fiable et
  // multiplateforme, sans toucher aux permissions du systeme de fichiers.
  await mkdir(join(dir, '.claude-dashboard', 'permissions.json'), { recursive: true });

  await assert.rejects(() => store.grant('Bash'));
  assert.deepEqual(
    store.list(),
    [],
    "si l ecriture echoue, la memoire ne doit pas dire 'accorde' alors que le disque ne l a jamais ete : redemarrer redemanderait a tort la permission alors que l etat en memoire promettait qu elle etait la"
  );
  assert.equal(store.isGranted('Bash'), false);
});

test('un echec d ecriture sur revoke ne met pas la memoire a jour', async () => {
  const dir = await scratch();
  const store = await createPermissionStore(dir);
  await store.grant('Bash');

  // Remplace le fichier par un dossier apres l octroi reussi, pour faire echouer la revocation.
  const { rm } = await import('node:fs/promises');
  await rm(join(dir, '.claude-dashboard', 'permissions.json'));
  await mkdir(join(dir, '.claude-dashboard', 'permissions.json'), { recursive: true });

  await assert.rejects(() => store.revoke('Bash'));
  assert.equal(
    store.isGranted('Bash'),
    true,
    "si l ecriture de la revocation echoue, la permission doit rester accordee en memoire : sinon l ecran de reglages afficherait la revocation comme faite alors que le redemarrage suivant la retablirait silencieusement"
  );
});

test('un fichier valide mais de forme inattendue repart de zero', async () => {
  const dir = await scratch();
  await mkdir(join(dir, '.claude-dashboard'), { recursive: true });
  await writeFile(join(dir, '.claude-dashboard', 'permissions.json'), '{"granted": "pas un tableau"}');

  const store = await createPermissionStore(dir);
  assert.deepEqual(store.list(), []);
});
