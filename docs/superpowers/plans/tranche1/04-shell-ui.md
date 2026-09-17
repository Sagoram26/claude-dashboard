# Feature 04 — Shell UI

Objectif : les trois régions fixes du design system, avec les tokens de couleur clairs et sombres.

Barre supérieure 40px, pied de page 26px, corps entre les deux. La barre latérale n'existe pas encore (tranche 3). Les contrôles de la barre supérieure et les valeurs du pied de page sont statiques à ce stade ; ils sont câblés en tranches 2 et 3.

**Files:**
- Create: `client/src/tokens.css`
- Create: `client/src/components/TopBar.tsx`
- Create: `client/src/components/Footer.tsx`
- Create: `client/src/screens/Session.tsx`
- Create: `client/src/screens/Session.test.tsx`
- Modify: `client/src/main.tsx`
- Create: `vitest.config.ts`

**Interfaces:**
- Consomme : rien du serveur pour l'instant.
- Produit :
  - `<Session>` — l'écran principal, occupe la fenêtre entière.
  - `<TopBar controls={ControlPill[]} />` où `type ControlPill = { label: string; tone?: 'neutral' | 'warn' | 'accent'; dashed?: boolean }`
  - `<Footer items={FooterItem[]} />` où `type FooterItem = { text: string; tone?: 'neutral' | 'warn' | 'ok'; align?: 'left' | 'right' }`

---

- [ ] **Step 1: Configurer Vitest**

Installer l'environnement de test DOM :

```bash
npm install -D jsdom @testing-library/react @testing-library/dom
```

Créer `vitest.config.ts` :

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['client/src/**/*.test.tsx'],
    globals: true,
  },
});
```

- [ ] **Step 2: Écrire le test du shell qui échoue**

Créer `client/src/screens/Session.test.tsx` :

```tsx
import { test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Session } from './Session.tsx';

test('affiche les trois régions fixes', () => {
  render(<Session />);
  expect(screen.getByRole('banner')).toBeDefined();
  expect(screen.getByRole('main')).toBeDefined();
  expect(screen.getByRole('contentinfo')).toBeDefined();
});

test('la barre supérieure porte les contrôles runtime', () => {
  render(<Session />);
  const banner = screen.getByRole('banner');
  expect(banner.textContent).toContain('Opus 5');
  expect(banner.textContent).toContain('high');
});

test('le pied de page porte de l état, pas de bouton', () => {
  render(<Session />);
  const footer = screen.getByRole('contentinfo');
  expect(footer.querySelectorAll('button').length).toBe(0);
});
```

Le troisième test verrouille la deuxième loi de la mise en page : le haut sert à agir, le bas sert à savoir. Un bouton dans le pied de page doit faire échouer la suite.

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

Run: `npm run test:client`
Expected: FAIL — `Cannot find module './Session.tsx'`

- [ ] **Step 4: Écrire les tokens**

Créer `client/src/tokens.css`. Les valeurs viennent de `docs/design-system.md` — ne pas les réinventer.

```css
:root {
  --bg: #0e0f11;
  --surface: #141619;
  --surface-raised: #1a1d21;
  --border: #26292e;
  --border-strong: #33373d;
  --text: #e8eaed;
  --text-muted: #9aa0a8;
  --text-faint: #646a72;
  --accent: #6b8afd;
  --accent-soft: rgba(107, 138, 253, 0.12);
  --warn: #e0a23c;
  --warn-soft: rgba(224, 162, 60, 0.1);
  --ok: #5ec26a;
  --danger: #e06a6a;

  --font-ui: Inter, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;

  --topbar-h: 40px;
  --footer-h: 26px;
  --sidebar-w: 280px;
  --conversation-max: 760px;

  --radius-control: 5px;
  --radius-card: 7px;
}

:root[data-theme='light'] {
  --bg: #ffffff;
  --surface: #f7f8f9;
  --surface-raised: #ffffff;
  --border: #e3e5e8;
  --border-strong: #c9ccd1;
  --text: #16181b;
  --text-muted: #5c6269;
  --text-faint: #8a9098;
  --accent: #3558d4;
  --accent-soft: rgba(53, 88, 212, 0.09);
  --warn: #b4741a;
  --warn-soft: rgba(180, 116, 26, 0.09);
  --ok: #2f8f42;
  --danger: #c0392f;
}

* { box-sizing: border-box; }

html, body, #root { height: 100%; margin: 0; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: 13px;
  line-height: 1.45;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  font-size: 11px;
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
  transition: border-color 120ms ease-out, background 120ms ease-out;
}

.pill:hover { border-color: var(--border-strong); }
.pill:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.pill[data-tone='warn'] { border-color: var(--warn); color: var(--warn); }
.pill[data-tone='accent'] { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.pill[data-dashed='true'] { border-style: dashed; }

.mono { font-family: var(--font-mono); }
```

- [ ] **Step 5: Écrire la barre supérieure**

Créer `client/src/components/TopBar.tsx` :

```tsx
export type ControlPill = {
  label: string;
  tone?: 'neutral' | 'warn' | 'accent';
  dashed?: boolean;
};

export function TopBar({ controls }: { controls: ControlPill[] }) {
  return (
    <header
      role="banner"
      style={{
        height: 'var(--topbar-h)',
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        padding: '0 10px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {controls.map((control) => (
        <button
          key={control.label}
          className="pill"
          data-tone={control.tone ?? 'neutral'}
          data-dashed={control.dashed ? 'true' : undefined}
        >
          {control.label}
          <span style={{ opacity: 0.5 }}>▾</span>
        </button>
      ))}
      <span style={{ marginLeft: 'auto', color: 'var(--text-faint)', fontSize: 11 }}>⌘K</span>
    </header>
  );
}
```

- [ ] **Step 6: Écrire le pied de page**

Créer `client/src/components/Footer.tsx` :

```tsx
export type FooterItem = {
  text: string;
  tone?: 'neutral' | 'warn' | 'ok';
  align?: 'left' | 'right';
};

const TONE_COLOR = {
  neutral: 'var(--text-muted)',
  warn: 'var(--warn)',
  ok: 'var(--ok)',
} as const;

export function Footer({ items }: { items: FooterItem[] }) {
  const left = items.filter((item) => item.align !== 'right');
  const right = items.filter((item) => item.align === 'right');

  const render = (item: FooterItem, index: number) => (
    <span key={`${item.text}-${index}`} style={{ color: TONE_COLOR[item.tone ?? 'neutral'] }}>
      {item.text}
    </span>
  );

  return (
    <footer
      role="contentinfo"
      style={{
        height: 'var(--footer-h)',
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 10px',
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        fontSize: 11,
      }}
    >
      {left.map(render)}
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>{right.map(render)}</span>
    </footer>
  );
}
```

Le pied de page ne rend que des `<span>`. Aucun élément interactif n'y est possible par construction — c'est ce que vérifie le test de l'étape 2.

- [ ] **Step 7: Écrire l'écran Session**

Créer `client/src/screens/Session.tsx` :

```tsx
import { TopBar, type ControlPill } from '../components/TopBar.tsx';
import { Footer, type FooterItem } from '../components/Footer.tsx';

const PLACEHOLDER_CONTROLS: ControlPill[] = [
  { label: 'Opus 5' },
  { label: 'high' },
  { label: 'acceptEdits' },
  { label: 'TDD', dashed: true },
];

const PLACEHOLDER_FOOTER: FooterItem[] = [
  { text: 'main' },
  { text: 'claude-dashboard' },
  { text: '$0.00', align: 'right' },
  { text: 'connecté', tone: 'ok', align: 'right' },
];

export function Session() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar controls={PLACEHOLDER_CONTROLS} />
      <main role="main" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div style={{ width: '100%', maxWidth: 'var(--conversation-max)', flex: 1, padding: 16 }} />
        </div>
      </main>
      <Footer items={PLACEHOLDER_FOOTER} />
    </div>
  );
}
```

Les constantes sont marquées `PLACEHOLDER` pour qu'un `grep PLACEHOLDER` en fin de tranche 3 retrouve tout ce qui reste à câbler.

- [ ] **Step 8: Monter l'écran**

Réécrire `client/src/main.tsx` :

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Session } from './screens/Session.tsx';
import './tokens.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root introuvable');

createRoot(root).render(
  <StrictMode>
    <Session />
  </StrictMode>
);
```

- [ ] **Step 9: Lancer le test pour vérifier qu'il passe**

Run: `npm run test:client`
Expected: PASS — 3 tests verts

- [ ] **Step 10: Vérifier les deux thèmes à l'œil**

Run: `npx vite`
Expected: la fenêtre est sombre, la barre supérieure fait 40px et le pied 26px. Dans la console du navigateur, `document.documentElement.dataset.theme = 'light'` bascule en clair et tout reste lisible.

- [ ] **Step 11: Commit**

```bash
git add client/src/tokens.css client/src/components/ client/src/screens/ client/src/main.tsx vitest.config.ts package.json
git commit -m "feat: shell ui, trois régions fixes et tokens des deux thèmes"
```
