import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { GrantedPermission } from '../protocol.ts';

export type PermissionStore = {
  list(): GrantedPermission[];
  grant(toolName: string): Promise<void>;
  revoke(toolName: string): Promise<void>;
  isGranted(toolName: string): boolean;
};

const FICHIER = join('.claude-dashboard', 'permissions.json');

function parse(raw: string): GrantedPermission[] {
  const data: unknown = JSON.parse(raw);
  if (typeof data !== 'object' || data === null) return [];
  const granted = (data as { granted?: unknown }).granted;
  if (!Array.isArray(granted)) return [];
  return granted.filter(
    (entry): entry is GrantedPermission =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as GrantedPermission).toolName === 'string' &&
      typeof (entry as GrantedPermission).grantedAt === 'string'
  );
}

export async function createPermissionStore(cwd: string): Promise<PermissionStore> {
  const chemin = join(cwd, FICHIER);

  let granted: GrantedPermission[] = [];
  try {
    granted = parse(await readFile(chemin, 'utf8'));
  } catch {
    // Fichier absent, illisible ou de forme inattendue : on repart d'une liste vide.
    // Jamais bloquant — une permission oubliée se redemande, un serveur qui ne démarre pas ne se
    // rattrape pas.
    granted = [];
  }

  const ecrire = async () => {
    await mkdir(dirname(chemin), { recursive: true });
    await writeFile(chemin, `${JSON.stringify({ granted }, null, 2)}\n`, 'utf8');
  };

  return {
    list: () => [...granted],

    isGranted: (toolName) => granted.some((g) => g.toolName === toolName),

    async grant(toolName) {
      if (granted.some((g) => g.toolName === toolName)) return;
      granted = [...granted, { toolName, grantedAt: new Date().toISOString() }];
      await ecrire();
    },

    async revoke(toolName) {
      const reste = granted.filter((g) => g.toolName !== toolName);
      if (reste.length === granted.length) return;
      granted = reste;
      await ecrire();
    },
  };
}
