import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGitWatcher } from './git-watcher.ts';
import type { ServerEvent } from '../protocol.ts';

function fakeRun(answers: Record<string, string>) {
  const calls: string[][] = [];
  const run = async (args: string[]) => {
    calls.push(args);
    const key = args.join(' ');
    const answer = answers[key];
    if (answer === undefined) throw new Error(`git non simule pour : ${key}`);
    return answer;
  };
  return { run, calls };
}

function fakeWatchFs() {
  let onChange: (() => void) | null = null;
  let stopped = false;
  const watchFs = (cb: () => void) => {
    onChange = cb;
    return () => {
      stopped = true;
    };
  };
  return {
    watchFs,
    trigger: () => onChange?.(),
    isStopped: () => stopped,
  };
}

const REPONSES_PAR_DEFAUT = {
  'rev-parse --abbrev-ref HEAD': 'tranche-3\n',
  'status --porcelain=v1': ' M src/a.ts\n?? src/b.ts\nA  src/c.ts\n',
  'diff --numstat': '3\t1\tsrc/a.ts\n',
  'diff --cached --numstat': '5\t0\tsrc/c.ts\n',
};

test('au demarrage, calcule un instantane et diffuse git.state et files.changed', async () => {
  const events: ServerEvent[] = [];
  const { run } = fakeRun(REPONSES_PAR_DEFAUT);
  const { watchFs } = fakeWatchFs();

  const watcher = createGitWatcher({ cwd: '/repo', emit: (e) => events.push(e), run, watchFs });
  await new Promise((r) => setTimeout(r, 10));

  const gitState = events.find((e) => e.type === 'git.state');
  assert.ok(gitState && gitState.type === 'git.state');
  assert.deepEqual(gitState.git, { branch: 'tranche-3', dirty: 2, staged: 1 });

  const filesChanged = events.find((e) => e.type === 'files.changed');
  assert.ok(filesChanged && filesChanged.type === 'files.changed');
  assert.deepEqual(
    [...filesChanged.files].sort((a, b) => a.path.localeCompare(b.path)),
    [
      { path: 'src/a.ts', added: 3, removed: 1 },
      { path: 'src/b.ts', added: 0, removed: 0 },
      { path: 'src/c.ts', added: 5, removed: 0 },
    ]
  );

  watcher.stop();
});

test('state() rend le dernier instantane calcule', async () => {
  const { run } = fakeRun(REPONSES_PAR_DEFAUT);
  const { watchFs } = fakeWatchFs();

  const watcher = createGitWatcher({ cwd: '/repo', emit: () => {}, run, watchFs });
  await new Promise((r) => setTimeout(r, 10));

  assert.deepEqual(watcher.state().git, { branch: 'tranche-3', dirty: 2, staged: 1 });
  watcher.stop();
});

test('un evenement de systeme de fichiers redeclenche un instantane', async () => {
  const events: ServerEvent[] = [];
  let branche = 'tranche-3\n';
  const run = async (args: string[]) => {
    const key = args.join(' ');
    if (key === 'rev-parse --abbrev-ref HEAD') return branche;
    return (REPONSES_PAR_DEFAUT as Record<string, string>)[key] ?? '';
  };
  const { watchFs, trigger } = fakeWatchFs();

  const watcher = createGitWatcher({ cwd: '/repo', emit: (e) => events.push(e), run, watchFs });
  await new Promise((r) => setTimeout(r, 10));

  branche = 'autre-branche\n';
  trigger();
  await new Promise((r) => setTimeout(r, 10));

  const dernier = events.filter((e) => e.type === 'git.state').at(-1);
  assert.ok(dernier && dernier.type === 'git.state');
  assert.equal(dernier.git.branch, 'autre-branche');

  watcher.stop();
});

test('sans evenement de systeme de fichiers, aucune interrogation periodique', async () => {
  const appels: string[][] = [];
  const run = async (args: string[]) => {
    appels.push(args);
    const key = args.join(' ');
    return (REPONSES_PAR_DEFAUT as Record<string, string>)[key] ?? '';
  };
  const { watchFs } = fakeWatchFs();

  const watcher = createGitWatcher({ cwd: '/repo', emit: () => {}, run, watchFs });
  await new Promise((r) => setTimeout(r, 10));
  const apresDemarrage = appels.length;

  await new Promise((r) => setTimeout(r, 150));
  assert.equal(appels.length, apresDemarrage, 'aucun appel git supplementaire sans evenement fs');

  watcher.stop();
});

test('stop() libere l abonnement au systeme de fichiers', async () => {
  const { run } = fakeRun(REPONSES_PAR_DEFAUT);
  const { watchFs, isStopped } = fakeWatchFs();

  const watcher = createGitWatcher({ cwd: '/repo', emit: () => {}, run, watchFs });
  await new Promise((r) => setTimeout(r, 10));

  watcher.stop();
  assert.equal(isStopped(), true);
});
