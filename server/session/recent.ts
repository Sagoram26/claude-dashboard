import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type RecentSession = {
  cwd: string;
  sessionId: string;
  title: string;
  branch: string | null;
  lastActivity: string;
  /** `entrypoint === 'sdk'` (sdk.d.ts:9315) : distingue une session lancee via le SDK (dashboard,
   * ou tout autre hote SDK) d une session lancee au terminal (`entrypoint: 'cli'`). Heuristique, pas
   * une garantie contractuelle — le format des transcripts ne l est pas non plus. */
  fromDashboard: boolean;
};

/**
 * Scanne `~/.claude/projects` (format interne, non contractuel) pour peupler l ecran d accueil.
 * Lecture tolerante : dossier absent, fichier illisible ou ligne corrompue ne font jamais echouer
 * l appel, ils sont silencieusement ignores.
 */
export async function listRecentSessions(baseDir: string): Promise<RecentSession[]> {
  let projectDirs: string[];
  try {
    const entries = await readdir(baseDir, { withFileTypes: true });
    projectDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }

  const sessions: RecentSession[] = [];
  for (const dir of projectDirs) {
    let files: string[];
    try {
      const entries = await readdir(join(baseDir, dir), { withFileTypes: true });
      files = entries.filter((e) => e.isFile() && e.name.endsWith('.jsonl')).map((e) => e.name);
    } catch {
      continue;
    }
    for (const file of files) {
      const session = await readSessionMetadata(join(baseDir, dir, file));
      if (session) sessions.push(session);
    }
  }

  sessions.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
  return sessions;
}

async function readSessionMetadata(path: string): Promise<RecentSession | null> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return null;
  }

  let cwd: string | null = null;
  let sessionId: string | null = null;
  let branch: string | null = null;
  let lastActivity: string | null = null;
  let aiTitle: string | null = null;
  let lastPrompt: string | null = null;
  let fromDashboard = false;

  for (const line of raw.split('\n')) {
    if (line.length === 0) continue;
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // ligne corrompue : format interne, on l ignore et on continue
    }
    if (typeof entry.cwd === 'string') cwd = entry.cwd;
    if (typeof entry.sessionId === 'string') sessionId = entry.sessionId;
    if (typeof entry.gitBranch === 'string') branch = entry.gitBranch;
    if (typeof entry.timestamp === 'string') lastActivity = entry.timestamp;
    if (entry.type === 'ai-title' && typeof entry.aiTitle === 'string') aiTitle = entry.aiTitle;
    if (entry.type === 'last-prompt' && typeof entry.lastPrompt === 'string') lastPrompt = entry.lastPrompt;
    if (entry.entrypoint === 'sdk') fromDashboard = true;
  }

  if (cwd === null || sessionId === null || lastActivity === null) return null;

  return {
    cwd,
    sessionId,
    title: aiTitle ?? lastPrompt ?? sessionId,
    branch,
    lastActivity,
    fromDashboard,
  };
}
