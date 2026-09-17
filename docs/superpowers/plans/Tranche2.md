# Tranche 2 — Permissions et contrôles : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Mener une session en mode de permission manuel de bout en bout, sans jamais toucher au terminal.

**Architecture:** Le callback `canUseTool` du SDK suspend l'exécution, le serveur diffuse une demande au client et attend la décision, puis rend le verdict. Une liste de permissions persistantes court-circuite les demandes déjà accordées.

**Tech Stack:** identique à la tranche 1.

**Spec:** [../specs/2026-09-16-claude-dashboard-v1-design.md](../specs/2026-09-16-claude-dashboard-v1-design.md) — sections 3.6 et 3.1.

**Procédé:** [PROCESS.md](PROCESS.md) — cycle rouge/vert/revue, statuts de sortie dont `TEST_DEFECT`.

## Global Constraints

Celles de [Tranche1.md](Tranche1.md), plus :

- **Ne jamais retourner `null` depuis `canUseTool`** : le SDK documente que `null` signifie « la réponse a été envoyée hors bande » et laisse l'outil bloqué indéfiniment. Les prompts de permission n'ont pas de délai d'expiration.
- Le bouton « Toujours pour cet outil » est masqué quand `options.suppressAlwaysAllowRule` est vrai : la règle qu'il écrirait accorderait plus que l'action demandée.
- Quand il est affiché, il renvoie l'intégralité de `options.suggestions` en `updatedPermissions`.
- Le texte d'invite affiché vient de `options.title` quand il est présent, jamais d'une reconstruction à partir de `toolName` et `input`.
- Le nom d'un serveur MCP est du texte non fiable : l'échapper avant affichage, et fonder les décisions sur `options.mcpServer.source`, jamais sur le nom.
- Les signatures exactes viennent de `docs/environnement.md`, produit par la feature 00. **Aucune signature n'est écrite de mémoire ni d'après une documentation résumée.**

---

## Features, dans l'ordre

| # | Feature | Livrable |
|---|---|---|
| 00 | Reconnaissance d'environnement | `docs/environnement.md` : versions installées et signatures réelles extraites des `.d.ts` |
| 01 | Pont `canUseTool` | Une demande de permission suspend l'agent et atteint le client |
| 02 | Bloc d'approbation | Le bloc dans le fil, avec commande ou diff exact, et ses trois actions |
| 03 | Rappel ancré | La ligne au-dessus du composeur pendant l'attente, absente sinon |
| 04 | Permissions persistantes | Stockage et court-circuit des demandes déjà accordées |
| 05 | Écran Réglages | La coquille de l'écran 3 du spec, avec la section Permissions accordées et sa révocation |
| 06 | Contrôles à chaud | Modèle, effort et mode de permission modifiables en cours de session |
| 07 | **Couture** | Une permission traverse tout le système, du SDK jusqu'à l'état client et retour |

L'écran Réglages naît en feature 05 parce que « Toujours pour cet outil » serait un piège sans lui : on accorderait un droit qu'on ne saurait plus retirer. Il n'accueille en tranche 2 que la section Permissions accordées ; les autres sections le rejoignent en tranches 3 et 4.

## Feature 00 — Reconnaissance d'environnement

**Elle précède toute écriture de code.** Son rôle est de supprimer la classe d'erreurs qui a produit quatre arbitrages sur douze en tranche 1 : un plan écrit en supposant un environnement au lieu de le constater.

Elle produit `docs/environnement.md` contenant :

- Les versions réellement installées : `node -v`, la version de TypeScript, celle de `@anthropic-ai/claude-agent-sdk`.
- Les signatures **extraites de `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`**, copiées telles quelles, pour tout ce que la tranche 2 appelle :
  - `CanUseTool` et son objet d'options complet
  - `PermissionResult`, `PermissionUpdate`, `PermissionUpdateDestination`, `PermissionBehavior`
  - `PermissionMode` et ses valeurs
  - `Query.setModel`, `Query.setPermissionMode`, `Query.applyFlagSettings`
  - `Query.supportedModels` et le type `ModelInfo`
  - `EffortLevel`
- Tout écart constaté entre ces signatures et ce que la spécification v1 suppose.

Les features 01 à 07 citent ce fichier. Elles n'inventent aucune signature.

## Feature 07 — Couture

**Mandat explicite : tester ce qu'aucune autre feature ne teste.** Chaque feature est vérifiée contre des doubles ; personne ne vérifie la jonction. C'est exactement ce qui a laissé passer deux défauts critiques en tranche 1, où chaque feature était pourtant conforme à sa propre spécification.

Le test de couture de cette tranche fait traverser une demande de permission sur tout son trajet, **sans double de protocole entre les deux bouts** :

1. Un faux `query` déclenche `canUseTool` avec un outil et une entrée réalistes.
2. Le gestionnaire de session crée la demande et l'émet.
3. L'événement traverse un vrai serveur WebSocket.
4. Le réducteur du client le reçoit et le range dans l'état.
5. La réponse repart en sens inverse et débloque le `canUseTool` suspendu.

Le test échoue si un champ change de nom en route, si un événement n'est jamais consommé, ou si la promesse de `canUseTool` n'est jamais résolue.

Le faux `query` existe déjà dans les tests de la tranche 1 : la couture demande un mandat, pas un outillage nouveau.

## Vérification à mi-parcours

**Dès la feature 04 terminée, lancer `npm run verify:e2e`** — sans attendre la fin de la tranche.

Ce script rejoue le critère de fin contre le vrai SDK et consomme des crédits (~0,20 $). En tranche 1, l'avoir lancé après la feature 03 aurait montré qu'aucun `message.delta` ne sortait, avant que trois features de client soient construites par-dessus.

Une suite verte prouve la cohérence de chaque morceau avec lui-même. Elle ne prouve pas que l'application marche.

## Critère de fin

1. Passer la session en mode `default`, demander une action qui exige une approbation.
2. Le bloc apparaît dans le fil avec le contenu exact ; le rappel apparaît au-dessus du composeur.
3. Autoriser : l'action s'exécute, le rappel disparaît, la trace reste dans le fil avec la décision.
4. Refuser avec une raison : l'agent la reçoit et s'adapte.
5. « Toujours pour cet outil » : la demande suivante pour ce même outil ne bloque plus.
6. Révoquer depuis les réglages : le blocage revient.
7. Changer de modèle en cours de session, envoyer un message, vérifier que le coût évolue au tarif du nouveau modèle.
8. Une demande laissée sans réponse ne fait jamais tomber la session : elle attend.

Les points 1 à 6 s'ajoutent à `scripts/verify-e2e.mjs` au fur et à mesure de la tranche, pour que le critère de fin reste exécutable et non déclaratif.
