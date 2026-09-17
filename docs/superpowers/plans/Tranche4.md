# Tranche 4 — Workflows et prompts : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Des workflows à réglages par étape et barrières optionnelles, une bibliothèque de prompts, et la palette de commandes.

**Architecture:** Un workflow est une séquence d'étapes ; l'exécuteur envoie la consigne de l'étape, applique ses réglages via les méthodes de contrôle de la session, attend la fin du tour, dépose un checkpoint, et passe à la suivante — sauf si l'étape porte une barrière, auquel cas il attend un feu vert.

**Tech Stack:** identique à la tranche 1.

**Spec:** [../specs/2026-09-16-claude-dashboard-v1-design.md](../specs/2026-09-16-claude-dashboard-v1-design.md) — sections 3.7 et 3.8.

**Procédé:** [PROCESS.md](PROCESS.md). Comme toute tranche, celle-ci commence par une **feature 00 de reconnaissance d'environnement** — signatures réelles des méthodes de contrôle utilisées entre les étapes d'un workflow, et forme exacte de `SDKControlInterruptResponse` dont l'accusé de réception devient utile ici — et se termine par une **feature de couture** dont le mandat est de faire traverser un workflow complet, du lancement jusqu'aux checkpoints rendus dans le fil, en franchissant une barrière.

`npm run verify:e2e` se lance **à mi-parcours** de la tranche, pas seulement à la fin.

## Global Constraints

Celles de [Tranche1.md](Tranche1.md), plus :

- Les trois objets de travail restent **distincts** : Process (injecté au démarrage), Prompts (bibliothèque), Workflows (séquence). Ne pas les fusionner en un objet unique « preset » : la décision a été prise explicitement.
- Le réglage par étape est ce qui donne sa valeur au workflow. Une étape porte son modèle, son mode de permission et éventuellement un subagent. Sans cela, un workflow n'est qu'une todo.
- La barrière est **optionnelle et décidée par étape**. La barrière systématique a été explicitement écartée : elle remet l'utilisateur en goulot d'étranglement, exactement ce qu'un workflow cherche à éviter.
- Les changements de réglage entre étapes passent par `setModel()`, `setPermissionMode()` et `applyFlagSettings({effortLevel})` sur la session en cours — pas par une nouvelle session, sinon le contexte est perdu entre les étapes.
- Un checkpoint est un événement chronologique : il vit dans le fil de conversation, jamais dans la barre latérale.
- Le fan-out reste désactivé. L'entrée existe dans la colonne Lancer et annonce sa disponibilité en v2.
- Les workflows, prompts et favoris sont stockés en fichiers simples, lisibles et éditables à la main. Pas de base de données.

## Features

| # | Feature | Livrable |
|---|---|---|
| 01 | Modèle de workflow | Types, stockage, éditeur d'étapes avec réglages et case barrière |
| 02 | Exécuteur et barrières | Enchaînement, application des réglages par étape, suspension sur barrière |
| 03 | Checkpoints | Rendu dans le fil, rappel de l'étape courante dans la barre supérieure |
| 04 | Bibliothèque de prompts | Stockage, colonne Lancer, épinglage en favoris |
| 05 | Palette de commandes | Recherche unifiée prompts, skills et subagents, filtrage par type |

## Critère de fin

1. Créer un workflow de trois étapes avec un modèle différent par étape et une barrière sur la deuxième.
2. Le lancer : chaque étape s'exécute avec son propre modèle — vérifiable dans le checkpoint qui porte le nom du modèle utilisé.
3. L'exécution suspend à la barrière et affiche ses deux actions dans le fil.
4. « Continuer » reprend à l'étape suivante ; « Corriger » rend la main sans avancer.
5. Le rappel de l'étape courante dans la barre supérieure est juste, et disparaît hors workflow.
6. Le contexte est conservé d'une étape à l'autre : l'étape 3 sait ce qu'a fait l'étape 1.
7. La palette trouve un prompt, un skill et un subagent par le même champ de recherche.
8. L'entrée fan-out est visible mais inerte, et annonce la v2.
