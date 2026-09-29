import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { PromptDefinition } from '../protocol.ts';

/**
 * Un fichier JSON par prompt, indenté : `<dir>/<id>.json` — même motif que `server/workflows/store.ts`.
 * `dir` est un paramètre explicite, jamais un chemin en dur.
 */
export async function listPrompts(dir: string): Promise<PromptDefinition[]> {
  let files: string[];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    files = entries.filter((e) => e.isFile() && e.name.endsWith('.json')).map((e) => e.name);
  } catch {
    return [];
  }

  const prompts: PromptDefinition[] = [];
  for (const file of files) {
    try {
      const raw = await readFile(join(dir, file), 'utf8');
      prompts.push(JSON.parse(raw) as PromptDefinition);
    } catch {
      continue; // fichier corrompu ou illisible : ignoré, pas d'échec global
    }
  }
  return prompts;
}

export async function loadPrompt(dir: string, id: string): Promise<PromptDefinition | null> {
  try {
    const raw = await readFile(join(dir, `${id}.json`), 'utf8');
    return JSON.parse(raw) as PromptDefinition;
  } catch {
    return null;
  }
}

export async function savePrompt(dir: string, prompt: PromptDefinition): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${prompt.id}.json`), JSON.stringify(prompt, null, 2));
}

export async function deletePrompt(dir: string, id: string): Promise<void> {
  try {
    await rm(join(dir, `${id}.json`));
  } catch {
    // déjà absent : pas une erreur
  }
}
