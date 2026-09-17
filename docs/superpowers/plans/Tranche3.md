# Tranche 3 — État dérivé et barre latérale : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Toutes les informations d'état justes et à jour — contexte, coût, git, fichiers modifiés, extensions — plus la barre latérale à trois colonnes et l'écran d'accueil.

**Architecture:** Le serveur dérive quatre agrégats et les pousse quand ils changent. Le client ne calcule rien qu'il pourrait recevoir.

**Tech Stack:** identique à la tranche 1.

**Spec:** [../specs/2026-09-16-claude-dashboard-v1-design.md](../specs/2026-09-16-claude-dashboard-v1-design.md) — sections 3.3, 3.4, 3.5, 3.9.

**Procédé:** [PROCESS.md](PROCESS.md). Comme toute tranche, celle-ci commence par une **feature 00 de reconnaissance d'environnement** — signatures réelles de `getContextUsage`, `mcpServerStatus`, `supportedAgents`, `supportedCommands` extraites des `.d.ts` vers `docs/environnement.md` — et se termine par une **feature de couture** dont le mandat est de faire traverser un agrégat d'état réellement produit par le serveur jusqu'à son rendu dans le pied de page, sans double de protocole entre les deux.

`npm run verify:e2e` se lance **à mi-parcours** de la tranche, pas seulement à la fin.

## Global Constraints

Celles de [Tranche1.md](Tranche1.md), plus :

- **Le contexte est fourni nativement.** `query.getContextUsage({detail})` rend `SDKContextUsage` : `total_tokens`, `raw_max_tokens`, `percentage`, `over_limit?`, `categories[]` (chacune avec `kind: 'used' | 'free' | 'buffer' | 'deferred'`), `mcp_tools[]` avec tokens par outil et serveur, `memory_files[]` pour CLAUDE.md, `agents[]`, `skills[]`. Le repli « total seul » prévu par le spec est caduc : ne pas l'implémenter.
- `detail: 'full'` compte chaque catégorie via l'API de comptage de tokens, `'summary'` répond depuis la dernière réponse et des estimations locales. Utiliser `'summary'` pour le rafraîchissement de la jauge et `'full'` uniquement à l'ouverture du popover.
- Les extensions viennent de `supportedModels()`, `supportedAgents()`, `supportedCommands()` et `mcpServerStatus()`. Ne rien inventer ni parser.
- Les fichiers modifiés viennent de **l'état git du dossier**, pas des outils d'édition observés : un fichier touché hors de l'application doit apparaître, et l'information doit survivre à une reprise de session.
- L'état git se rafraîchit sur événement de système de fichiers, jamais en interrogation périodique.
- Les transcripts de `~/.claude/projects` sont une source **opportuniste** pour peupler l'accueil : format interne non contractuel, lecture tolérante aux champs manquants, échec silencieux, et jamais bloquante pour l'affichage.

## Features

| # | Feature | Livrable |
|---|---|---|
| 01 | Contexte | Jauge alimentée par `getContextUsage`, seuil d'alerte à 80% |
| 02 | Coût | Accumulation des `total_cost_usd` des messages `result` |
| 03 | Git et fichiers modifiés | Branche, fichiers modifiés, fichiers en stage, deltas par fichier |
| 04 | Barre latérale à trois colonnes | Sélecteur d'icônes, sections repliables, état replié mémorisé |
| 05 | Popover de contexte | Ventilation par origine, action de compactage |
| 06 | Écran d'accueil | Dossiers récents, cartes de session reprenables |

En fin de tranche, `grep -rn PLACEHOLDER client/src` ne doit plus rien rendre : la barre supérieure et le pied de page laissés statiques en tranche 1 sont câblés ici.

## Critère de fin

1. La ventilation du contexte est cohérente avec la session ; le total correspond à la jauge.
2. Un compactage fait redescendre la jauge sans que la session perde le fil.
3. Modifier un fichier hors de l'application met à jour le pied de page et la liste des fichiers.
4. La section Activité reste repliée par défaut, son compteur s'incrémente.
5. Un serveur MCP hors ligne est signalé comme tel, pas masqué.
6. Fermer et rouvrir l'application : la session apparaît dans l'accueil avec des métadonnées justes, et la reprendre restitue le contexte de l'échange précédent.
7. Une session lancée hors du dashboard est listée mais annoncée comme non reprenable, sans échouer au clic.
