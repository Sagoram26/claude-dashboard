import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listRecentSessions } from './recent.ts';

const scratch = () => mkdtemp(join(tmpdir(), 'cd-recent-'));

async function ecrireTranscript(baseDir: string, projet: string, fichier: string, lignes: unknown[]) {
  const dir = join(baseDir, projet);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, fichier), lignes.map((l) => JSON.stringify(l)).join('\n'));
}

test('un dossier absent rend une liste vide, jamais une erreur', async () => {
  const sessions = await listRecentSessions(join(tmpdir(), 'jamais-cree-' + Date.now()));
  assert.deepEqual(sessions, []);
});

test('lit les sessions depuis des transcripts valides, triees par activite recente', async () => {
  const baseDir = await scratch();
  await ecrireTranscript(baseDir, 'projet-a', 's1.jsonl', [
    { type: 'user', cwd: '/repo/a', sessionId: 's1', gitBranch: 'main', timestamp: '2026-09-20T10:00:00.000Z', entrypoint: 'sdk' },
  ]);
  await ecrireTranscript(baseDir, 'projet-a', 's2.jsonl', [
    { type: 'user', cwd: '/repo/a', sessionId: 's2', gitBranch: 'main', timestamp: '2026-09-25T10:00:00.000Z', entrypoint: 'sdk' },
  ]);

  const sessions = await listRecentSessions(baseDir);

  assert.deepEqual(sessions.map((s) => s.sessionId), ['s2', 's1']);
  assert.equal(sessions[0]?.cwd, '/repo/a');
  assert.equal(sessions[0]?.branch, 'main');
});

test('une ligne corrompue ne fait pas echouer la lecture', async () => {
  const baseDir = await scratch();
  const dir = join(baseDir, 'projet-b');
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 's1.jsonl'),
    '{ceci n est pas du json}\n' +
      JSON.stringify({ type: 'user', cwd: '/repo/b', sessionId: 's1', timestamp: '2026-09-20T10:00:00.000Z' })
  );

  const sessions = await listRecentSessions(baseDir);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.cwd, '/repo/b');
});

test('aiTitle sert de titre, sinon lastPrompt, sinon l identifiant de session', async () => {
  const baseDir = await scratch();
  await ecrireTranscript(baseDir, 'projet-c', 'avec-titre.jsonl', [
    { type: 'user', cwd: '/repo/c', sessionId: 'avec-titre', timestamp: '2026-09-20T10:00:00.000Z' },
    { type: 'ai-title', aiTitle: 'Un titre genere', sessionId: 'avec-titre' },
  ]);
  await ecrireTranscript(baseDir, 'projet-c', 'avec-prompt.jsonl', [
    { type: 'user', cwd: '/repo/c', sessionId: 'avec-prompt', timestamp: '2026-09-19T10:00:00.000Z' },
    { type: 'last-prompt', lastPrompt: 'Le dernier prompt', sessionId: 'avec-prompt' },
  ]);
  await ecrireTranscript(baseDir, 'projet-c', 'sans-rien.jsonl', [
    { type: 'user', cwd: '/repo/c', sessionId: 'sans-rien', timestamp: '2026-09-18T10:00:00.000Z' },
  ]);

  const sessions = await listRecentSessions(baseDir);
  const parId = Object.fromEntries(sessions.map((s) => [s.sessionId, s]));

  assert.equal(parId['avec-titre']?.title, 'Un titre genere');
  assert.equal(parId['avec-prompt']?.title, 'Le dernier prompt');
  assert.equal(parId['sans-rien']?.title, 'sans-rien');
});

test('distingue les sessions issues du SDK de celles lancees ailleurs', async () => {
  const baseDir = await scratch();
  await ecrireTranscript(baseDir, 'projet-d', 'via-sdk.jsonl', [
    { type: 'user', cwd: '/repo/d', sessionId: 'via-sdk', timestamp: '2026-09-20T10:00:00.000Z', entrypoint: 'sdk' },
  ]);
  await ecrireTranscript(baseDir, 'projet-d', 'via-cli.jsonl', [
    { type: 'user', cwd: '/repo/d', sessionId: 'via-cli', timestamp: '2026-09-19T10:00:00.000Z', entrypoint: 'cli' },
  ]);

  const sessions = await listRecentSessions(baseDir);
  const parId = Object.fromEntries(sessions.map((s) => [s.sessionId, s]));

  assert.equal(parId['via-sdk']?.fromDashboard, true);
  assert.equal(parId['via-cli']?.fromDashboard, false);
});
