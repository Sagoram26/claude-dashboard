import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { WorkflowDefinition } from '../protocol.ts';

/**
 * Un fichier JSON par workflow, indenté : `<dir>/<id>.json` — la condition « éditable à la main ».
 * `dir` est un paramètre explicite, jamais un chemin en dur (cf. `server/session/recent.ts`).
 */
export async function listWorkflows(dir: string): Promise<WorkflowDefinition[]> {
  let files: string[];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    files = entries.filter((e) => e.isFile() && e.name.endsWith('.json')).map((e) => e.name);
  } catch {
    return [];
  }

  const workflows: WorkflowDefinition[] = [];
  for (const file of files) {
    try {
      const raw = await readFile(join(dir, file), 'utf8');
      workflows.push(JSON.parse(raw) as WorkflowDefinition);
    } catch {
      continue; // fichier corrompu ou illisible : ignoré, pas d'échec global
    }
  }
  return workflows;
}

export async function loadWorkflow(dir: string, id: string): Promise<WorkflowDefinition | null> {
  try {
    const raw = await readFile(join(dir, `${id}.json`), 'utf8');
    return JSON.parse(raw) as WorkflowDefinition;
  } catch {
    return null;
  }
}

export async function saveWorkflow(dir: string, workflow: WorkflowDefinition): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${workflow.id}.json`), JSON.stringify(workflow, null, 2));
}

export async function deleteWorkflow(dir: string, id: string): Promise<void> {
  try {
    await rm(join(dir, `${id}.json`));
  } catch {
    // déjà absent : pas une erreur
  }
}
