# Feature 06 — Interruption

Objectif : interrompre une génération en cours, et garantir que la session reste utilisable après.

Le second point est le vrai sujet. Interrompre est facile ; ce qui casse une session, c'est un itérable d'entrée laissé dans un état incohérent. Le test qui compte est celui qui envoie un message **après** l'interruption et vérifie qu'il aboutit.

`query.interrupt()` retourne `Promise<SDKControlInterruptResponse | undefined>` : `undefined` sur les CLI anciens, sinon un accusé de réception listant les messages encore en file. La tranche 1 ignore ce retour ; il deviendra utile en tranche 4 quand un workflow enchaînera des messages.

**Files:**
- Modify: `server/session/manager.ts`
- Modify: `server/session/manager.test.ts`
- Create: `client/src/components/GeneratingIndicator.tsx`
- Modify: `client/src/components/Composer.tsx`
- Modify: `client/src/screens/Session.tsx`
- Modify: `client/src/state.test.ts`

**Interfaces:**
- Consomme : `SessionManager.interrupt()` de la feature 03, la commande `session.interrupt` du protocole.
- Produit : `<GeneratingIndicator onInterrupt={() => void} />`. Le `status` de `AppState` gouverne son affichage.

---

- [ ] **Step 1: Écrire le test d'interruption qui échoue**

Ajouter à `server/session/manager.test.ts` :

```ts
test('interrompre laisse la session utilisable', async () => {
  const events: ServerEvent[] = [];
  const interruptCalls: number[] = [];
  const userTexts: string[] = [];

  const query = ({ prompt }: { prompt: unknown }) => {
    const iterable = prompt as AsyncIterable<{ message: { content: unknown } }>;

    const generator = (async function* () {
      for await (const userMessage of iterable) {
        const content = userMessage.message.content;
        userTexts.push(typeof content === 'string' ? content : '');
        yield {
          type: 'assistant',
          message: { content: [{ type: 'text', text: `vu ${userTexts.length}` }] },
          uuid: `m${userTexts.length}`,
          session_id: 's1',
        };
        yield {
          type: 'result',
          subtype: 'success',
          total_cost_usd: 0.01,
          session_id: 's1',
          uuid: `r${userTexts.length}`,
        };
      }
    })();

    return Object.assign(generator, {
      interrupt: async () => {
        interruptCalls.push(Date.now());
        return undefined;
      },
    });
  };

  const manager = createSessionManager({
    cwd: '/tmp',
    emit: (e) => events.push(e),
    queryFn: query as never,
  });

  manager.send('premier');
  await new Promise((r) => setTimeout(r, 20));

  await manager.interrupt();
  assert.equal(interruptCalls.length, 1);

  manager.send('apres interruption');
  await new Promise((r) => setTimeout(r, 20));

  assert.deepEqual(userTexts, ['premier', 'apres interruption']);
  assert.equal(manager.state().status, 'idle');

  await manager.stop();
});

test('le statut passe à generating puis revient à idle', async () => {
  const states: string[] = [];
  const { query } = fakeQuery(() => [
    {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'ok' }] },
      uuid: 'm1',
      session_id: 's1',
    },
    { type: 'result', subtype: 'success', total_cost_usd: 0.01, session_id: 's1', uuid: 'r1' },
  ]);

  const manager = createSessionManager({
    cwd: '/tmp',
    emit: (e) => {
      if (e.type === 'session.state') states.push(e.state.status);
    },
    queryFn: query,
  });

  manager.send('salut');
  await new Promise((r) => setTimeout(r, 20));

  assert.deepEqual(states, ['generating', 'idle']);
  await manager.stop();
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm test`
Expected: FAIL — le second `send` n'aboutit pas, ou `interrupt` n'est pas appelé

- [ ] **Step 3: Corriger le gestionnaire si nécessaire**

L'implémentation de la feature 03 devrait déjà passer : la file reste ouverte après `interrupt()`, et `interrupt()` remet le statut à `idle`.

Si le test échoue, la cause probable est que `interrupt()` a été appelé alors que le statut était déjà `idle` et qu'un `setState` inutile a été émis. Rendre l'appel idempotent :

```ts
async interrupt() {
  if (state.status !== 'generating') return;
  await session.interrupt();
  setState({ status: 'idle' });
},
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npm test`
Expected: PASS — tous les tests serveur verts

- [ ] **Step 5: Commit du serveur**

```bash
git add server/session/manager.ts server/session/manager.test.ts
git commit -m "feat: interruption qui laisse la session utilisable"
```

- [ ] **Step 6: Écrire l'indicateur de génération**

Créer `client/src/components/GeneratingIndicator.tsx` :

```tsx
export function GeneratingIndicator({ onInterrupt }: { onInterrupt: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 0',
        fontSize: 11,
        color: 'var(--text-muted)',
      }}
    >
      <span className="generating-dot" aria-hidden="true" />
      <span>Génération en cours…</span>
      <button type="button" className="pill" onClick={onInterrupt} style={{ marginLeft: 'auto' }}>
        Interrompre <span style={{ color: 'var(--text-faint)' }}>esc</span>
      </button>
    </div>
  );
}
```

Ajouter à `client/src/tokens.css` la seule animation autorisée par le design system :

```css
.generating-dot {
  width: 6px;
  height: 6px;
  border-radius: 99px;
  background: var(--accent);
  animation: generating-pulse 2s ease-in-out infinite;
}

@keyframes generating-pulse {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .generating-dot { animation: none; }
}
```

Deux secondes, faible amplitude, et coupée si l'utilisateur a demandé moins de mouvement. C'est la seule exception à la règle « rien ne boucle, ne pulse ni ne rebondit ».

- [ ] **Step 7: Écrire le test d'interface qui échoue**

Ajouter à `client/src/screens/Session.test.tsx` :

```tsx
test('l indicateur de génération apparaît et permet d interrompre', () => {
  const sent: string[] = [];
  const listeners: ((e: { data: string }) => void)[] = [];

  class FakeWebSocket {
    readyState = 1;
    set onmessage(fn: (e: { data: string }) => void) { listeners.push(fn); }
    send(payload: string) { sent.push(payload); }
    close() {}
  }
  vi.stubGlobal('WebSocket', FakeWebSocket);

  render(<Session />);

  listeners[0]?.({
    data: JSON.stringify({
      type: 'session.state',
      state: {
        sessionId: 's1',
        cwd: '/tmp',
        status: 'generating',
        model: 'claude-opus-5',
        permissionMode: 'default',
      },
    }),
  });

  const button = screen.getByRole('button', { name: /interrompre/i });
  fireEvent.click(button);

  expect(sent).toContain(JSON.stringify({ type: 'session.interrupt' }));
});

test('l indicateur est absent au repos', () => {
  class FakeWebSocket {
    readyState = 1;
    set onmessage(_fn: (e: { data: string }) => void) {}
    send() {}
    close() {}
  }
  vi.stubGlobal('WebSocket', FakeWebSocket);

  render(<Session />);
  expect(screen.queryByRole('button', { name: /interrompre/i })).toBeNull();
});
```

- [ ] **Step 8: Lancer le test pour vérifier qu'il échoue**

Run: `npm run test:client`
Expected: FAIL — aucun bouton « Interrompre »

- [ ] **Step 9: Câbler l'indicateur dans l'écran**

Dans `client/src/screens/Session.tsx`, importer le composant et l'insérer entre `<Conversation>` et `<Composer>` :

```tsx
import { GeneratingIndicator } from '../components/GeneratingIndicator.tsx';
```

```tsx
<Conversation messages={state.messages} />
{state.status === 'generating' && (
  <GeneratingIndicator
    onInterrupt={() => connection.current?.send({ type: 'session.interrupt' })}
  />
)}
<Composer
  disabled={state.status === 'disconnected'}
  onSend={(text) => connection.current?.send({ type: 'message.send', text })}
/>
```

Le composeur reste actif pendant la génération : on doit pouvoir préparer le message suivant sans attendre.

- [ ] **Step 10: Ajouter le raccourci clavier**

Dans le même fichier, à l'intérieur de `Session` :

```tsx
useEffect(() => {
  if (state.status !== 'generating') return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') connection.current?.send({ type: 'session.interrupt' });
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [state.status]);
```

L'écouteur n'existe que pendant la génération : hors de là, Échap servira à fermer un popover en tranche 3.

- [ ] **Step 11: Lancer tous les tests**

Run: `npm test && npm run test:client && npm run typecheck`
Expected: tout vert, aucune erreur de typage

- [ ] **Step 12: Vérification manuelle du critère de fin de tranche**

Serveur et client démarrés, dans un vrai dossier de projet :

1. Envoyer « liste les fichiers de ce dossier ». La réponse s'écrit.
2. Envoyer un second message. Il aboutit dans la même session.
3. Envoyer « écris un poème de cent lignes », puis cliquer Interrompre. La génération s'arrête.
4. Refaire l'étape 3 avec la touche Échap. Même résultat.
5. Envoyer un message après l'interruption. Il aboutit.
6. Aucun nom d'outil visible dans la colonne de conversation.

- [ ] **Step 13: Commit**

```bash
git add client/src/components/GeneratingIndicator.tsx client/src/components/Composer.tsx client/src/screens/Session.tsx client/src/screens/Session.test.tsx client/src/tokens.css
git commit -m "feat: interruption depuis l'interface, bouton et raccourci"
```

- [ ] **Step 14: Marquer la tranche terminée**

Cocher le critère de fin dans `../Tranche1.md` et vérifier qu'un `grep -rn PLACEHOLDER client/src` ne rend que les contrôles de la barre supérieure et les items du pied de page — les deux seules choses volontairement non câblées à ce stade.
