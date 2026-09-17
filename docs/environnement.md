# Environnement réel

Relevé le 2026-09-17, branche `tranche-2`. Source unique :
`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`.

## Versions installées

```
$ node -v
v24.21.0

$ npx tsc --version
Version 7.0.2

$ node -p "require('./node_modules/@anthropic-ai/claude-agent-sdk/package.json').version"
0.3.274

$ node -p "require('./package.json').engines"
{ node: '>=22.6' }
```

`sdk.d.ts` fait 9368 lignes, déclarations générées mais lisibles (types nommés,
commentaires JSDoc conservés). Pas d'obstacle à la lecture directe.

## Signatures — permissions

### `CanUseTool` (sdk.d.ts:205-298)

Commentaire précédant le type (lignes 205-211) :

```ts
/**
 * Called before each tool execution to determine if it should be allowed.
 *
 * Return `null` ONLY after the consumer has already sent the
 * control_response out-of-band (e.g. a signed HTTP POST echoing
 * `requestId`); the SDK will skip its own transport write. Fail-closed: an
 * accidental null means no control_response is sent and the tool stays
 * blocked indefinitely — permission prompts have no park deadline.
 */
```

Déclaration complète (lignes 213-298) :

```ts
export declare type CanUseTool = (toolName: string, input: Record<string, unknown>, options: {
    /** Signaled if the operation should be aborted. */
    signal: AbortSignal;
    /**
     * Suggestions for updating permissions so that the user will not be
     * prompted again for this tool during this session.
     *
     * Typically if presenting the user an option 'always allow' or similar,
     * then this full set of suggestions should be returned as the
     * `updatedPermissions` in the PermissionResult.
     */
    suggestions?: PermissionUpdate[];
    /**
     * The file path that triggered the permission request, if applicable.
     * For example, when a Bash command tries to access a path outside allowed directories.
     */
    blockedPath?: string;
    /**
     * For `mcp__*` tools: the MCP server serving the tool and where its
     * definition came from. `source: 'sdk'` means one of the in-process
     * servers this SDK host registered (its `name` is the key you registered;
     * only the host can register one); any other value (`plugin`, `user`,
     * `project`, `local`, `dynamic`, `managed`, …) is a server from
     * configuration, whose `name` is the key as authored there — untrusted
     * text, escape it before display. Key trust decisions on `source`, not on
     * the name or the tool-name prefix. Absent for non-MCP tools and on CLIs
     * that predate the field.
     */
    mcpServer?: {
        name: string;
        source: string;
    };
    /** Explains why this permission request was triggered. */
    decisionReason?: string;
    /**
     * Full permission prompt sentence rendered by the bridge (e.g.
     * "Claude wants to read foo.txt"). Use this as the primary prompt
     * text when present instead of reconstructing from toolName+input.
     */
    title?: string;
    /**
     * Short noun phrase for the tool action (e.g. "Read file"), suitable
     * for button labels or compact UI.
     */
    displayName?: string;
    /**
     * Human-readable subtitle from the bridge (e.g. "Claude will have
     * read and write access to files in ~/Downloads").
     */
    description?: string;
    /**
     * The ask must not be approvable by a single stray keystroke: open the
     * prompt on its decline option and offer no one-key approve shortcut.
     */
    defaultToNo?: boolean;
    /**
     * The ask must not offer a persistent "don't ask again" choice: the
     * rule it would write grants more than this ask's own action.
     */
    suppressAlwaysAllowRule?: boolean;
    /**
     * Unique identifier for this specific tool call within the assistant message.
     * Multiple tool calls in the same assistant message will have different toolUseIDs.
     */
    toolUseID: string;
    /** If running within the context of a sub-agent, the sub-agent's ID. */
    agentID?: string;
    /**
     * The control_request envelope's `request_id`. A control_response sent
     * out-of-band (e.g. a signed HTTP POST instead of the SDK's WS write)
     * must echo this value for the worker to match it.
     */
    requestId: string;
    /**
     * Set when a user-configured ask RULE (permissions.ask) forced this
     * prompt while the ask carries the tool's own decisionReason. Hosts
     * making policy on the reason (e.g. auto-deny a safetyCheck) or
     * running host-side auto-approval should treat asks carrying this
     * field as rule-forced: the user's stated intent is a human prompt.
     */
    matchedAskRule?: {
        source: string;
        toolName: string;
        ruleContent?: string;
    };
}) => Promise<PermissionResult | null>;
```

Points signalés par la spec (step 3) :
- **`async` / retour** : `CanUseTool` retourne `Promise<PermissionResult | null>`.
  C'est une fonction, pas nécessairement déclarée `async` par l'appelant, mais
  le SDK attend une Promise résolvant vers `PermissionResult | null`.
- **Arguments** : positionnels pour `toolName` et `input`, puis un troisième
  argument `options` qui est un objet groupé. Ce n'est donc ni tout positionnel
  ni tout groupé — deux positionnels puis un objet d'options.
- Le `null` est documenté explicitement, en commentaire ET admis par le type
  (`PermissionResult | null`) : voir la section Écarts, point 1.

### `PermissionResult` et ses variantes (sdk.d.ts:2389-2401)

```ts
export declare type PermissionResult = {
    behavior: 'allow';
    updatedInput?: Record<string, unknown>;
    updatedPermissions?: PermissionUpdate[];
    toolUseID?: string;
    decisionClassification?: PermissionDecisionClassification;
} | {
    behavior: 'deny';
    message: string;
    interrupt?: boolean;
    toolUseID?: string;
    decisionClassification?: PermissionDecisionClassification;
};
```

Deux variantes seulement, discriminées par `behavior: 'allow' | 'deny'`. Pas de
variante `'ask'` au niveau de `PermissionResult` (contrairement à
`PermissionBehavior`, voir plus bas — c'est un type différent utilisé ailleurs,
pour les règles, pas pour la valeur rendue par `canUseTool`).

`PermissionDecisionClassification` (sdk.d.ts:2347, citée car référencée par
`PermissionResult`) :

```ts
export declare type PermissionDecisionClassification = 'user_temporary' | 'user_permanent' | 'user_reject';
```

### `PermissionUpdate`, `PermissionUpdateDestination`, `PermissionBehavior` (sdk.d.ts:2342, 2403-2437)

```ts
export declare type PermissionBehavior = 'allow' | 'deny' | 'ask';

export declare type PermissionRuleValue = {
    toolName: string;
    ruleContent?: string;
};

export declare type PermissionUpdate = {
    type: 'addRules';
    rules: PermissionRuleValue[];
    behavior: PermissionBehavior;
    destination: PermissionUpdateDestination;
} | {
    type: 'replaceRules';
    rules: PermissionRuleValue[];
    behavior: PermissionBehavior;
    destination: PermissionUpdateDestination;
} | {
    type: 'removeRules';
    rules: PermissionRuleValue[];
    behavior: PermissionBehavior;
    destination: PermissionUpdateDestination;
} | {
    type: 'setMode';
    mode: PermissionMode;
    destination: PermissionUpdateDestination;
} | {
    type: 'addDirectories';
    directories: string[];
    destination: PermissionUpdateDestination;
} | {
    type: 'removeDirectories';
    directories: string[];
    destination: PermissionUpdateDestination;
};

export declare type PermissionUpdateDestination = 'userSettings' | 'projectSettings' | 'localSettings' | 'session' | 'cliArg';
```

`PermissionUpdate` est une union à six variantes selon `type`, pas un objet
plat. « Renvoyer l'intégralité de `options.suggestions` en
`updatedPermissions` » (comme l'affirme la contrainte globale de Tranche2.md)
revient donc à repasser un tableau d'unions telles quelles, sans les
retraiter — aucune variante n'a de champ en commun garanti à part `type` et
`destination` (les variantes `addDirectories`/`removeDirectories` n'ont pas de
`behavior`).

### `PermissionMode` (sdk.d.ts:2363-2366)

```ts
/**
 * Permission mode for controlling how tool executions are handled. 'default' - Standard behavior, prompts for dangerous operations. 'acceptEdits' - Auto-accept file edit operations. 'bypassPermissions' - Bypass all permission checks (requires allowDangerouslySkipPermissions). 'plan' - Planning mode, no actual tool execution. 'dontAsk' - Don't prompt for permissions, deny if not pre-approved. 'auto' - Use a model classifier to approve/deny permission prompts.
 */
export declare type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto';
```

Six valeurs exactes : `'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'`.

## Signatures — contrôles de session

Toutes trois sont des méthodes de l'objet `Query` retourné par `query()`
(sdk.d.ts, bloc `Query` autour des lignes 2660-2820).

```ts
/**
 * Change the permission mode for the current session.
 * Only available in streaming input mode.
 *
 * @param mode - The new permission mode to set
 */
setPermissionMode(mode: PermissionMode): Promise<void>;
```
(sdk.d.ts:2675) — `async`, un seul argument positionnel, retourne
`Promise<void>`.

```ts
/**
 * Change the model used for subsequent responses.
 * Only available in streaming input mode.
 *
 * @param model - The model identifier to use, or undefined to use the default
 */
setModel(model?: string): Promise<void>;
```
(sdk.d.ts:2703) — `async`, un argument positionnel optionnel, retourne
`Promise<void>`.

```ts
/**
 * Merge settings into the flag settings layer. This is the inline `settings`
 * option of `query()`, applied mid-session. Flag settings sit above
 * user/project/local and below managed policy settings in precedence order.
 *
 * Successive calls shallow-merge top-level keys — a second call with
 * `{permissions: {...}}` replaces the entire `permissions` object from a
 * prior call. Pass `null` for a key to clear it from the flag layer and
 * fall back to lower-precedence sources (`undefined` is dropped by JSON
 * serialization and has no effect). Four keys instead reset session state
 * and restore neither a `query()` option nor a settings-file value.
 * `effortLevel` goes to the model's default effort, `model` to Claude Code's
 * default model (not `ANTHROPIC_MODEL` or `settings.model`), `agent` to no
 * main-thread agent, and `ultracode` to off with the current effort kept.
 * Only available in streaming input mode.
 *
 * @param settings - A partial settings object to merge into the flag
 * settings. `effortLevel` also accepts `'max'` (never written to settings
 * files, so the persisted {@link Settings.effortLevel} excludes it): it is
 * session-only, runs as `'high'` on a model without `'max'` support, and
 * runs no higher than the organization's effort limit for the model.
 */
applyFlagSettings(settings: {
    [K in keyof Settings]?: K extends 'effortLevel' ? EffortLevel | null : Settings[K] | null;
}): Promise<void>;
```
(sdk.d.ts:2749-2751) — `async`, un seul argument positionnel, mais cet
argument est un **objet groupé** (`Partial<Settings>` avec des valeurs
`| null` autorisées pour effacer une clé). `Settings` est un type tiers, non
extrait ici (il n'a pas été demandé par le step 3) : seul le champ
`effortLevel: EffortLevel | null` est garanti explicitement par la contrainte
mappée `K extends 'effortLevel'`.

### `Query.supportedModels` et `ModelInfo` (sdk.d.ts:2802-2807, 1310-1352)

```ts
/**
 * Get the list of available models.
 *
 * @returns Array of model information including display names and descriptions
 */
supportedModels(): Promise<ModelInfo[]>;
```
— `async`, aucun argument, retourne `Promise<ModelInfo[]>`.

```ts
/**
 * Information about an available model.
 */
export declare type ModelInfo = {
    /**
     * Model identifier to use in API calls
     */
    value: string;
    /**
     * Canonical wire model id this row's `value` resolves to (e.g. 'sonnet' → 'claude-sonnet-5'). Lets hosts match a persisted explicit id against the alias row that covers it.
     */
    resolvedModel?: string;
    /**
     * Human-readable display name
     */
    displayName: string;
    /**
     * Description of the model's capabilities
     */
    description: string;
    /**
     * Whether this model supports effort levels
     */
    supportsEffort?: boolean;
    /**
     * Available effort levels for this model
     */
    supportedEffortLevels?: ('low' | 'medium' | 'high' | 'xhigh' | 'max')[];
    /**
     * Whether this model supports adaptive thinking (Claude decides when and how much to think)
     */
    supportsAdaptiveThinking?: boolean;
    /**
     * Whether this model supports fast mode
     */
    supportsFastMode?: boolean;
    /**
     * Whether this model supports auto mode
     */
    supportsAutoMode?: boolean;
};
```

### `EffortLevel` (sdk.d.ts:623)

```ts
export declare type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
```

Cinq valeurs exactes. Note : `applyFlagSettings` documente que `'max'` est un
cas spécial pour `effortLevel` — jamais persisté dans les fichiers de
paramètres, traité comme `'high'` sur un modèle qui ne le supporte pas.
`ModelInfo.supportedEffortLevels` référence le même littéral inline
`('low' | 'medium' | 'high' | 'xhigh' | 'max')[]` plutôt que le nom
`EffortLevel[]` — les deux listes de valeurs sont identiques mais ce n'est pas
un alias au niveau du type déclaré.

## Écarts avec le spec v1

| Ce que suppose le spec / le plan | Ce que déclare `sdk.d.ts` | Écart |
|---|---|---|
| Tranche2.md : « Ne jamais retourner `null` depuis `canUseTool` : le SDK documente que `null` signifie que la réponse a été envoyée hors bande et laisse l'outil bloqué indéfiniment. » | Commentaire au-dessus de `CanUseTool` (sdk.d.ts:205-211) dit très exactement cela, et le type `Promise<PermissionResult \| null>` (ligne 298) admet `null`. | Aucun. Confirmé en commentaire **et** imposé par le compilateur (le type autorise `null`, donc rien n'empêche de le retourner par erreur — la discipline reste à la charge du code appelant). |
| Tranche2.md : « Le bouton "Toujours pour cet outil" est masqué quand `options.suppressAlwaysAllowRule` est vrai. » | `suppressAlwaysAllowRule?: boolean` existe bien dans l'objet d'options (sdk.d.ts:272). | Aucun. |
| Tranche2.md : « il renvoie l'intégralité de `options.suggestions` en `updatedPermissions`. » | `suggestions?: PermissionUpdate[]` existe (sdk.d.ts:224) et `PermissionResult.updatedPermissions?: PermissionUpdate[]` a le même type d'élément (sdk.d.ts:2392). | Aucun sur les types. À noter : `PermissionUpdate` est une union à six variantes (voir plus haut) — « renvoyer l'intégralité » suppose de recopier le tableau tel quel, sans le reconstruire champ par champ, sous peine d'oublier une variante. |
| Tranche2.md : « Le texte d'invite affiché vient de `options.title` quand il est présent. » | `title?: string` existe (sdk.d.ts:252). | Aucun. |
| Tranche2.md : « fonder les décisions sur `options.mcpServer.source`, jamais sur le nom. » | `mcpServer?: { name: string; source: string }` existe (sdk.d.ts:241-244), `source` est un `string` libre (pas une union de littéraux) et documenté comme pouvant valoir entre autres `'sdk'`, `'plugin'`, `'user'`, `'project'`, `'local'`, `'dynamic'`, `'managed'`. | Léger : `source` n'est pas un type énuméré strict côté TypeScript, donc aucune vérification statique ne garantit qu'il vaut une des valeurs documentées — la garde reste runtime. |
| `server/protocol.ts:19` : `ClientCommand` `permission.respond` a une `decision: 'allow' \| 'always' \| 'deny'`. | `PermissionBehavior` (utilisé par les règles/`PermissionUpdate`) vaut `'allow' \| 'deny' \| 'ask'` ; `PermissionResult.behavior` vaut seulement `'allow' \| 'deny'`. | `'always'` n'existe dans aucune énumération du SDK. C'est un concept UI propre au dashboard (un `'allow'` accompagné de `updatedPermissions`), pas une valeur SDK — a documenter comme telle pour éviter qu'une future feature cherche `'always'` côté SDK. |
| `server/protocol.ts:32-41` : `PermissionRequest.toolUseId` (casse camel, `Id`). | L'objet d'options de `CanUseTool` porte `toolUseID: string` (casse `ID`, sdk.d.ts:277). | Écart de casse pur (`toolUseId` vs `toolUseID`). Le champ existe bien côté SDK, seul le nom diffère — un renommage silencieux à la traduction protocole → SDK, à documenter explicitement dans la feature qui construira `PermissionRequest` pour ne pas confondre les deux. |
| `server/protocol.ts:40` : `PermissionRequest.canAlwaysAllow: boolean`. | Aucun champ `canAlwaysAllow` dans l'objet d'options. Le champ le plus proche est l'inverse logique : `suppressAlwaysAllowRule?: boolean` (sdk.d.ts:272, vrai quand le bouton doit être **masqué**). | Le champ du protocole n'a pas de source directe : il faudrait le dériver (`canAlwaysAllow = !suppressAlwaysAllowRule`), ce qui n'est pas la même chose qu'une valeur fournie telle quelle par le SDK. Voir aussi le point 3 ci-dessous. |

### Les trois points nommément demandés

**1. `null` de `canUseTool`.** Confirmé en commentaire ET en type : voir
la première ligne du tableau ci-dessus. Citation exacte reproduite dans
la section « Signatures — permissions ».

**2. `suppressAlwaysAllowRule`, `suggestions`, `title`, `mcpServer.source`.**
Les quatre existent dans l'objet d'options de `CanUseTool` :
- `suggestions?: PermissionUpdate[]` (sdk.d.ts:224)
- `title?: string` (sdk.d.ts:252)
- `suppressAlwaysAllowRule?: boolean` (sdk.d.ts:272)
- `mcpServer?: { name: string; source: string }`, donc `mcpServer.source: string` (sdk.d.ts:241-244)

Aucun des quatre n'est absent. Feature 02 peut s'appuyer dessus tel quel.

**3. `PermissionRequest` (`server/protocol.ts:32-41`) face à l'objet d'options réel.**

Champs de `PermissionRequest` et leur source :

| Champ du protocole | Source dans l'objet d'options (ou les paramètres positionnels) |
|---|---|
| `requestId` | `options.requestId: string` — correspond. |
| `toolUseId` | `options.toolUseID: string` — correspond en valeur, **pas en casse** (`Id` vs `ID`). |
| `toolName` | Premier paramètre positionnel de `CanUseTool`, `toolName: string` — pas dans `options`, mais existe bien dans la signature complète. |
| `title` | `options.title?: string` — correspond. |
| `displayName` | `options.displayName?: string` — correspond. |
| `description` | `options.description?: string` — correspond. |
| `input` | Deuxième paramètre positionnel, `input: Record<string, unknown>` — pas dans `options`, mais existe. |
| `canAlwaysAllow` | **Sans source directe.** Le SDK expose l'inverse (`suppressAlwaysAllowRule`), pas cette valeur. |

Champs de l'objet d'options qui n'ont **aucune contrepartie** dans
`PermissionRequest` et qui, d'après la contrainte globale de Tranche2.md,
sont pourtant nécessaires à la feature 02 :
- `suggestions?: PermissionUpdate[]` — indispensable pour construire la
  réponse « toujours » (le plan l'exige explicitement).
- `suppressAlwaysAllowRule?: boolean` — indispensable pour savoir si le
  bouton « toujours » doit être masqué (le plan l'exige explicitement).
- `mcpServer?: { name: string; source: string }` — indispensable pour la
  garde de confiance sur les outils `mcp__*` (le plan l'exige explicitement).
- `defaultToNo?: boolean` — affecte l'état par défaut du prompt (option
  ouverte sur le refus), non repris dans le protocole actuel.
- `decisionReason?: string`, `blockedPath?: string`, `agentID?: string`,
  `matchedAskRule?: {...}` — informatifs, pas cités comme requis par
  Tranche2.md, mais absents du protocole alors qu'ils existent côté SDK.

Conclusion : `PermissionRequest` tel qu'écrit en tranche 1 est **incomplet et
partiellement mal nommé** par rapport à ce que l'objet d'options fournit
réellement. `canAlwaysAllow` n'a pas de source directe (il faudrait le
dériver de `suppressAlwaysAllowRule`, avec une inversion de sens à ne pas
rater). `toolUseId` doit être vérifié pour la casse au moment de le remplir
depuis `options.toolUseID`. `suggestions`, `suppressAlwaysAllowRule` et
`mcpServer` manquent alors qu'ils sont explicitement requis par les
contraintes globales de la tranche 2. Ce type devra être révisé en feature
01 ou 02 ; ce relevé ne le modifie pas lui-même.

## Ce que je n'ai pas pu vérifier

- Le type `Settings` référencé par `applyFlagSettings` (`[K in keyof Settings]?: ...`)
  n'a pas été extrait : il n'était pas demandé par le step 3, et le localiser
  précisément dans un fichier de 9368 lignes généré aurait dépassé le
  périmètre de cette reconnaissance. Seul le champ `effortLevel` est garanti
  par la contrainte mappée visible dans la signature elle-même.
- `mcpServer.source` est typé `string` (pas une union de littéraux) : la
  liste de valeurs possibles (`'sdk'`, `'plugin'`, `'user'`, `'project'`,
  `'local'`, `'dynamic'`, `'managed'`, …) vient d'un commentaire, pas du
  système de types. Je ne peux pas garantir que cette liste est exhaustive —
  le commentaire dit explicitement « any other value ».
- Je n'ai pas vérifié si `canUseTool` est réellement appelé quelque part dans
  `server/session/manager.ts` en tranche 1 : ce fichier ne l'utilise pas
  encore (`session()` est appelé sans `options.canUseTool`). Le pont de
  permission est donc entièrement à construire en feature 01, pas à adapter
  depuis un usage existant.
- Je n'ai pas cherché si un type nommé `EffortLevel[]` distinct du littéral
  inline utilisé par `ModelInfo.supportedEffortLevels` existe ailleurs dans le
  fichier ; les deux listes de valeurs observées sont identiques mais je ne
  peux pas affirmer qu'aucune troisième déclaration ne diverge, un fichier de
  9368 lignes n'a pas été lu en intégralité, seulement grep + zones ciblées.
