# Feature 01 — Socle projet

Objectif : `npm run dev` démarre le serveur et le client, et un test de fumée vérifie que le serveur répond.

Le `package.json` existe déjà — il a été créé pendant l'investigation du SDK, avec `@anthropic-ai/claude-agent-sdk` en dépendance. On l'adapte, on ne le recrée pas. Node installé : v24. TypeScript passe en `"type": "module"` : le SDK est ESM et le code sera en modules ES.

**Files:**
- Modify: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.server.json`
- Create: `server/index.ts`
- Create: `client/index.html`
- Create: `client/src/main.tsx`
- Create: `vite.config.ts`
- Test: `server/index.test.ts`

**Interfaces:**
- Consomme : rien, c'est la première feature.
- Produit : `createServer(port: number): Promise<{ close: () => Promise<void>; port: number }>` exporté depuis `server/index.ts`. Les features suivantes s'y branchent.

---

- [ ] **Step 1: Installer les dépendances manquantes**

```bash
npm install ws
npm install -D typescript @types/node @types/ws vite @vitejs/plugin-react react react-dom @types/react @types/react-dom vitest
npm install react react-dom
```

- [ ] **Step 2: Réécrire package.json**

```json
{
  "name": "claude-dashboard",
  "version": "0.1.0",
  "description": "Une interface web locale pour Claude Code.",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "node --experimental-strip-types server/index.ts & vite",
    "build": "tsc -p tsconfig.server.json && vite build",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.server.json --noEmit",
    "test": "node --experimental-strip-types --test server/**/*.test.ts",
    "test:client": "vitest run"
  }
}
```

Les blocs `dependencies` et `devDependencies` sont laissés tels que npm les a écrits à l'étape 1 — ne pas les retaper à la main.

Note sur `dev` : le `&` lance le serveur en arrière-plan puis Vite au premier plan. Sur Windows dans PowerShell, `&` n'est pas un opérateur de fond ; utiliser deux terminaux, ou `npm run dev:server` et `npm run dev:client` séparément si le confort l'exige. Ne pas ajouter `concurrently` pour ça.

- [ ] **Step 3: Créer tsconfig.json (client)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true
  },
  "include": ["client/src", "server/protocol.ts", "vite.config.ts"]
}
```

- [ ] **Step 4: Créer tsconfig.server.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "outDir": "dist/server",
    "skipLibCheck": true,
    "verbatimModuleSyntax": true
  },
  "include": ["server"]
}
```

- [ ] **Step 5: Écrire le test de fumée qui échoue**

Créer `server/index.test.ts` :

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from './index.ts';

test('le serveur répond sur /health', async () => {
  const server = await createServer(0);
  try {
    const res = await fetch(`http://127.0.0.1:${server.port}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  } finally {
    await server.close();
  }
});
```

Le port `0` demande au système un port libre : les tests ne se marchent pas dessus et rien n'est codé en dur.

- [ ] **Step 6: Lancer le test pour vérifier qu'il échoue**

Run: `npm test`
Expected: FAIL — `Cannot find module './index.ts'`

- [ ] **Step 7: Écrire l'implémentation minimale**

Créer `server/index.ts` :

```ts
import { createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export async function createServer(port: number): Promise<{
  close: () => Promise<void>;
  port: number;
}> {
  const http = createHttpServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => http.listen(port, '127.0.0.1', resolve));
  const bound = http.address() as AddressInfo;

  return {
    port: bound.port,
    close: () => new Promise<void>((resolve, reject) =>
      http.close((err) => (err ? reject(err) : resolve()))
    ),
  };
}

const isEntrypoint = process.argv[1]?.endsWith('index.ts');
if (isEntrypoint) {
  const server = await createServer(4317);
  console.log(`server listening on http://127.0.0.1:${server.port}`);
}
```

Le garde `isEntrypoint` évite que l'import depuis le test démarre un vrai serveur sur le port fixe.

- [ ] **Step 8: Lancer le test pour vérifier qu'il passe**

Run: `npm test`
Expected: PASS — 1 test, 0 échec

- [ ] **Step 9: Créer le point d'entrée client**

Créer `client/index.html` :

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Claude Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Créer `client/src/main.tsx` :

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (!root) throw new Error('#root introuvable');

createRoot(root).render(
  <StrictMode>
    <p>Claude Dashboard</p>
  </StrictMode>
);
```

- [ ] **Step 10: Configurer Vite**

Créer `vite.config.ts` :

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    port: 5317,
    proxy: {
      '/health': 'http://127.0.0.1:4317',
      '/ws': { target: 'ws://127.0.0.1:4317', ws: true },
    },
  },
});
```

Le proxy permet au client de parler au serveur sans configuration d'origine croisée, en développement comme en production.

- [ ] **Step 11: Vérifier que le typage passe**

Run: `npm run typecheck`
Expected: aucune erreur

- [ ] **Step 12: Vérifier le démarrage manuellement**

Run: `node --experimental-strip-types server/index.ts` dans un terminal, `npx vite` dans un autre.
Expected: `http://127.0.0.1:5317` affiche « Claude Dashboard », et `http://127.0.0.1:5317/health` renvoie `{"ok":true}`.

- [ ] **Step 13: Commit**

```bash
git init
git add package.json package-lock.json tsconfig.json tsconfig.server.json vite.config.ts server/ client/ .gitignore README.md docs/
git commit -m "feat: socle projet, serveur http et client vite"
```

Le dépôt n'existe pas encore : ce premier commit l'initialise avec la documentation déjà écrite. Vérifier avec `git status` qu'aucun fichier inattendu n'est inclus, et que `node_modules/` et `.superdesign/` sont bien ignorés.
