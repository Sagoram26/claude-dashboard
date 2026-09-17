# Tranche 2 — Permissions et contrôles : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Mener une session en mode de permission manuel de bout en bout, sans jamais toucher au terminal.

**Architecture:** Le callback `canUseTool` du SDK suspend l'exécution, le serveur diffuse une demande au client et attend la décision, puis rend le verdict. Une liste de permissions persistantes court-circuite les demandes déjà accordées.

**Tech Stack:** identique à la tranche 1.

**Spec:** [../specs/2026-09-16-claude-dashboard-v1-design.md](../specs/2026-09-16-claude-dashboard-v1-design.md) — sections 3.6 et 3.1.

## Global Constraints

Celles de [Tranche1.md](Tranche1.md), plus :

- `canUseTool` a la signature **positionnelle** `(toolName, input, options)` et retourne `Promise<PermissionResult | null>`. `PermissionResult` vaut `{behavior:'allow', updatedInput?, updatedPermissions?}` ou `{behavior:'deny', message, interrupt?}`.
- **Ne jamais retourner `null`** : le SDK documente que `null` signifie « la réponse a été envoyée hors bande » et laisse l'outil bloqué indéfiniment. Les prompts de permission n'ont pas de délai d'expiration.
- Le bouton « Toujours pour cet outil » est masqué quand `options.suppressAlwaysAllowRule` est vrai : la règle qu'il écrirait accorderait plus que l'action demandée.
- Quand il est affiché, il renvoie l'intégralité de `options.suggestions` en `updatedPermissions`.
- Le texte d'invite affiché vient de `options.title` quand il est présent, jamais d'une reconstruction à partir de `toolName` et `input`.
- Le nom d'un serveur MCP est du texte non fiable : l'échapper avant affichage, et fonder les décisions sur `options.mcpServer.source`, jamais sur le nom.

## Features

| # | Feature | Livrable |
|---|---|---|
| 01 | Pont `canUseTool` | Une demande de permission suspend l'agent et atteint le client |
| 02 | Bloc d'approbation | Le bloc dans le fil, avec commande ou diff exact, et ses trois actions |
| 03 | Rappel ancré | La ligne au-dessus du composeur pendant l'attente, absente sinon |
| 04 | Permissions persistantes | Stockage et court-circuit des demandes déjà accordées |
| 05 | Écran Réglages | La coquille de l'écran 3 du spec, avec la section Permissions accordées et sa révocation |
| 06 | Contrôles à chaud | Modèle, effort et mode de permission modifiables en cours de session |

L'écran Réglages naît ici parce que « Toujours pour cet outil » serait un piège
sans lui : on accorderait un droit qu'on ne saurait plus retirer. Il n'accueille
en tranche 2 que la section Permissions accordées ; les sections MCP, Hooks,
Prompts, Workflows et Process le rejoignent en tranches 3 et 4.

Pour la feature 05, les méthodes existent déjà sur l'objet `Query` : `setModel(model?)`, `setPermissionMode(mode)`, et `applyFlagSettings({effortLevel})` pour l'effort. La liste des modèles disponibles vient de `supportedModels()`.

`PermissionMode` vaut `'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'`.

## Critère de fin

1. Passer la session en mode `default`, demander une action qui exige une approbation.
2. Le bloc apparaît dans le fil avec le contenu exact ; le rappel apparaît au-dessus du composeur.
3. Autoriser : l'action s'exécute, le rappel disparaît, la trace reste dans le fil avec la décision.
4. Refuser avec une raison : l'agent la reçoit et s'adapte.
5. « Toujours pour cet outil » : la demande suivante pour ce même outil ne bloque plus.
6. Révoquer depuis les réglages : le blocage revient.
7. Changer de modèle en cours de session, envoyer un message, vérifier que le coût évolue au tarif du nouveau modèle.
8. Une demande laissée sans réponse ne fait jamais tomber la session : elle attend.
