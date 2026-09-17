# Tranche 1 — Cœur session : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une session Claude Code pilotable depuis le navigateur, avec réponse en streaming et interruption.

**Architecture:** Un serveur Node local héberge le harnais via `@anthropic-ai/claude-agent-sdk` et expose un WebSocket. Le serveur pousse de l'état, le client pousse des intentions. Une file de messages alimente un `AsyncIterable<SDKUserMessage>` passé en `prompt` à `query()`, ce qui maintient la session ouverte entre les tours.

**Tech Stack:** Node 22.6+, TypeScript strict, `ws`, Vite + React, `node:test` côté serveur, Vitest côté client.

**Spec:** [../specs/2026-09-16-claude-dashboard-v1-design.md](../specs/2026-09-16-claude-dashboard-v1-design.md)

## Global Constraints

- Node 22.6 ou supérieur (`--experimental-strip-types` et le glob récursif de `node --test` l'exigent). TypeScript en mode `strict`.
- Dépendances de production autorisées : `@anthropic-ai/claude-agent-sdk`, `ws`, `react`, `react-dom`. Aucune autre sans justification écrite. Pas de framework serveur, pas de bibliothèque d'état, pas de librairie de composants.
- `server/protocol.ts` est le contrat unique partagé serveur/client. Les deux côtés l'importent ; une divergence doit être une erreur de compilation.
- Les appels d'outils n'apparaissent JAMAIS dans la colonne de conversation. Contrainte de construction, pas de discipline.
- Couleurs, tailles et espacements viennent de [../../design-system.md](../../design-system.md). Aucune valeur en dur hors des tokens.
- Les tests ne font aucun appel réseau et ne consomment aucun crédit : `query` est injecté.
- Un commit par tâche terminée.

---

## Features, dans l'ordre

| # | Feature | Livrable |
|---|---|---|
| 01 | [Socle projet](tranche1/01-socle-projet.md) | `npm run dev` démarre serveur et client, test de fumée vert |
| 02 | [Protocole WebSocket](tranche1/02-protocole-websocket.md) | Contrat typé partagé, aller-retour sérialisé testé |
| 03 | [Session manager](tranche1/03-session-manager.md) | Session ouverte multi-tours, messages poussés et diffusés |
| 04 | [Shell UI](tranche1/04-shell-ui.md) | Trois régions fixes, tokens clairs et sombres |
| 05 | [Conversation et streaming](tranche1/05-conversation-streaming.md) | Texte agent qui s'écrit au fil des deltas |
| 06 | [Interruption](tranche1/06-interruption.md) | Génération interruptible, session réutilisable ensuite |

L'ordre est contraint : 02 dépend de 01, 03 dépend de 02, 05 dépend de 03 et 04, 06 dépend de 05.

## Hors périmètre de cette tranche

Permissions et approbations (tranche 2), contrôles à chaud (tranche 2), contexte, coût, git, fichiers modifiés, barre latérale, écran d'accueil (tranche 3), workflows et prompts (tranche 4).

La barre supérieure et le pied de page sont construits en tranche 1 mais affichent des valeurs statiques. Ils sont câblés en tranches 2 et 3.

## Critère de fin

Dans un vrai dossier de projet :

1. `npm run dev`, ouvrir le navigateur.
2. Envoyer « liste les fichiers de ce dossier ». La réponse s'écrit progressivement.
3. Envoyer un second message. Il aboutit dans la même session : l'agent a le contexte du premier échange.
4. Envoyer « écris un poème de cent lignes », interrompre en cours. La génération s'arrête.
5. Envoyer un message après l'interruption. Il aboutit.
6. Aucun appel d'outil rendu dans la colonne de conversation.
7. `npm test` et `npm run test:client` verts.
