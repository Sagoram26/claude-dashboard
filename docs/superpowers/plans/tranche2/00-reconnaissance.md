# Feature 00 — Reconnaissance d'environnement

Objectif : produire `docs/environnement.md`, le document dont les features 01 à
07 tirent toutes leurs signatures.

Cette feature ne contient volontairement **aucune signature**. Elle dit où lire
et quoi extraire. Si elle citait du code, elle reproduirait exactement le défaut
qu'elle existe pour supprimer : quatre arbitrages sur douze en tranche 1 venaient
d'un plan écrit en supposant l'environnement au lieu de le constater —
TypeScript 5 alors que 7.0.2 est installé, un champ `session_id` poussé dans un
message qui ne le porte pas.

**Elle n'écrit aucun code de production et aucun test.** Elle lit et transcrit.

**Files:**
- Create: `docs/environnement.md`

**Interfaces:**
- Consomme : rien.
- Produit : `docs/environnement.md`, cité par les sept features suivantes.

---

- [ ] **Step 1: Relever les versions réellement installées**

```bash
node -v
npx tsc --version
node -p "require('./node_modules/@anthropic-ai/claude-agent-sdk/package.json').version"
node -p "require('./package.json').engines"
```

Reporter les quatre sorties telles quelles.

- [ ] **Step 2: Localiser le fichier de types du SDK**

```bash
ls node_modules/@anthropic-ai/claude-agent-sdk/
wc -l node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts
```

C'est la source unique. Ne pas consulter de documentation en ligne, ne pas
écrire de mémoire. Si un type cherché n'existe pas dans ce fichier, le dire :
« absent de `sdk.d.ts` » est un constat utile, une invention ne l'est pas.

- [ ] **Step 3: Extraire les déclarations demandées**

Pour chacune des entrées ci-dessous, copier la déclaration **telle quelle**,
avec son numéro de ligne, en suivant les types référencés jusqu'à ce que la
forme soit complète. Un type d'options dont on ne cite que le nom ne sert à
rien : c'est le détail de ses champs qui est demandé.

| Ce qu'il faut | Pourquoi la tranche 2 en a besoin |
|---|---|
| `CanUseTool`, et le type complet de son paramètre d'options | Feature 01, le pont de permission |
| `PermissionResult` et toutes ses variantes | Feature 01, la valeur rendue au SDK |
| `PermissionUpdate`, `PermissionUpdateDestination`, `PermissionBehavior` | Feature 04, « Toujours pour cet outil » |
| `PermissionMode` et la liste exacte de ses valeurs | Feature 06, le sélecteur de mode |
| `Query.setModel`, `Query.setPermissionMode`, `Query.applyFlagSettings` | Feature 06, les contrôles à chaud |
| `Query.supportedModels` et `ModelInfo` | Feature 06, peupler le sélecteur de modèle |
| `EffortLevel` et la liste exacte de ses valeurs | Feature 06, le sélecteur d'effort |

Signaler en particulier, pour chaque méthode : est-elle `async` ? que
retourne-t-elle ? les arguments sont-ils positionnels ou groupés dans un objet ?
C'est précisément sur ce point que la tranche 1 s'est trompée pour `canUseTool`.

- [ ] **Step 4: Confronter au spec v1 et lister les écarts**

Lire `docs/superpowers/specs/2026-09-16-claude-dashboard-v1-design.md`,
sections 3.6 et 3.1, ainsi que la section Global Constraints de
`docs/superpowers/plans/Tranche2.md`.

Pour chaque endroit où le spec ou le plan suppose une forme d'API, comparer à ce
qui a été extrait au step 3 et écrire une ligne de tableau :

| Ce que suppose le spec | Ce que déclare `sdk.d.ts` | Écart |
|---|---|---|

Un tableau vide est un résultat valable et doit être rendu comme tel. Ne pas
inventer d'écart pour justifier la feature.

Trois points à vérifier nommément, parce que le plan de tranche s'appuie dessus :

1. Le plan affirme qu'un `null` retourné par `canUseTool` signifie « réponse
   envoyée hors bande » et laisse l'outil bloqué. Est-ce que `sdk.d.ts` le dit,
   en type ou en commentaire ? Si oui, citer. Si le type n'admet pas `null` du
   tout, le dire : la contrainte resterait juste mais serait alors imposée par le
   compilateur.
2. Le plan cite `options.suppressAlwaysAllowRule`, `options.suggestions`,
   `options.title` et `options.mcpServer.source`. Ces quatre champs existent-ils,
   et avec quels types exacts ? Un seul absent change la feature 02.
3. `PermissionRequest` dans `server/protocol.ts:32-41` a été écrit en tranche 1
   avant toute vérification. Ses champs correspondent-ils à ce que l'objet
   d'options fournit réellement ? Lister les champs du protocole qui n'ont pas de
   source, et les champs de l'objet d'options qui mériteraient d'y entrer.

- [ ] **Step 5: Écrire `docs/environnement.md`**

Structure attendue :

```markdown
# Environnement réel

Relevé le <date>, branche `tranche-2`. Source unique :
`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`.

## Versions installées
## Signatures — permissions
## Signatures — contrôles de session
## Écarts avec le spec v1
## Ce que je n'ai pas pu vérifier
```

La dernière section est obligatoire et peut être vide. Si un type demandé est
introuvable, si une déclaration est générée et illisible, ou si le sens d'un
champ reste ambigu après lecture, c'est là que ça se dit. « Je n'ai pas pu »
est une réponse acceptée ; une supposition présentée comme un constat ne l'est
pas.

- [ ] **Step 6: Commit**

```bash
git add docs/environnement.md
git commit -m "docs: relevé de l'environnement réel pour la tranche 2"
```
