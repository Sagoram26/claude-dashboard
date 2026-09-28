import { watch } from 'node:fs';
import { execFile } from 'node:child_process';
import type { ServerEvent, ChangedFile, GitState } from '../protocol.ts';

export type GitCommandRunner = (args: string[]) => Promise<string>;
export type FsWatchFn = (onChange: () => void) => () => void;

export type GitSnapshot = { git: GitState; files: ChangedFile[] };

export type GitWatcherOptions = {
  cwd: string;
  emit: (event: ServerEvent) => void;
  run?: GitCommandRunner;
  watchFs?: FsWatchFn;
};

export type GitWatcher = {
  state(): GitSnapshot;
  stop(): void;
};

const VIDE: GitSnapshot = { git: { branch: '', dirty: 0, staged: 0 }, files: [] };

function defaultRun(cwd: string): GitCommandRunner {
  return (args) =>
    new Promise((resolve, reject) => {
      execFile('git', args, { cwd }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });
}

// Un seul `fs.watch` récursif sur le dossier, débattu : les éditeurs et git eux-mêmes déclenchent
// souvent une rafale d'événements pour une seule action (écriture puis renommage temporaire).
function defaultWatchFs(cwd: string): FsWatchFn {
  return (onChange) => {
    let timer: NodeJS.Timeout | null = null;
    const watcher = watch(cwd, { recursive: true }, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(onChange, 200);
    });
    return () => {
      if (timer) clearTimeout(timer);
      watcher.close();
    };
  };
}

function parseNumstat(output: string): Map<string, { added: number; removed: number }> {
  const deltas = new Map<string, { added: number; removed: number }>();
  for (const line of output.split('\n').filter((l) => l.length > 0)) {
    const [addedRaw, removedRaw, path] = line.split('\t');
    if (path === undefined) continue;
    // '-' marque un fichier binaire : numstat ne rend pas de compte de lignes.
    const added = addedRaw === '-' ? 0 : Number(addedRaw);
    const removed = removedRaw === '-' ? 0 : Number(removedRaw);
    const prev = deltas.get(path) ?? { added: 0, removed: 0 };
    deltas.set(path, { added: prev.added + added, removed: prev.removed + removed });
  }
  return deltas;
}

async function readSnapshot(run: GitCommandRunner): Promise<GitSnapshot> {
  const [branchOut, statusOut, diffOut, cachedOut] = await Promise.all([
    run(['rev-parse', '--abbrev-ref', 'HEAD']),
    run(['status', '--porcelain=v1']),
    run(['diff', '--numstat']),
    run(['diff', '--cached', '--numstat']),
  ]);

  const branch = branchOut.trim();
  let dirty = 0;
  let staged = 0;
  const paths = new Set<string>();

  for (const line of statusOut.split('\n').filter((l) => l.length > 0)) {
    const x = line[0];
    const y = line[1];
    const path = line.slice(3);
    paths.add(path);
    if (x !== ' ' && x !== '?') staged++;
    if (y !== ' ' || x === '?') dirty++;
  }

  const unstaged = parseNumstat(diffOut);
  const staged_ = parseNumstat(cachedOut);
  const files: ChangedFile[] = [...paths].map((path) => {
    const a = unstaged.get(path);
    const b = staged_.get(path);
    return {
      path,
      added: (a?.added ?? 0) + (b?.added ?? 0),
      removed: (a?.removed ?? 0) + (b?.removed ?? 0),
    };
  });

  return { git: { branch, dirty, staged }, files };
}

export function createGitWatcher(opts: GitWatcherOptions): GitWatcher {
  const run = opts.run ?? defaultRun(opts.cwd);
  const watchFs = opts.watchFs ?? defaultWatchFs(opts.cwd);

  let snapshot: GitSnapshot = VIDE;

  const refresh = () => {
    void readSnapshot(run).then((next) => {
      snapshot = next;
      opts.emit({ type: 'git.state', git: next.git });
      opts.emit({ type: 'files.changed', files: next.files });
    });
  };

  refresh();
  const unsubscribe = watchFs(refresh);

  return {
    state: () => snapshot,
    stop: () => unsubscribe(),
  };
}
