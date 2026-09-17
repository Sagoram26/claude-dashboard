# Claude Dashboard

Une interface web locale pour Claude Code.

Claude Code en ligne de commande expose déjà tout ce dont on a besoin : modèles,
niveaux d'effort, modes de permission, skills, subagents, serveurs MCP, hooks.
Ce qui manque, c'est une interface qui rende ces capacités lisibles et
manipulables. L'application desktop et l'extension VS Code n'exposent qu'une
fraction de cette surface ; le TUI l'expose entièrement mais derrière des
commandes qu'il faut connaître par cœur.

Ce projet ne réimplémente pas d'agent. Il héberge le harnais Claude Code via le
Claude Agent SDK et lui construit une interface digne de ce qu'il sait faire.

## État

Conception terminée pour la v1, plans d'implémentation écrits, code non
commencé. La tranche 1 est détaillée feature par feature ; les tranches 2 à 4
ont leur objectif, leurs contraintes et leur critère de fin, et seront
détaillées au moment de les attaquer.

Le design a été validé écran par écran. Les documents qui font foi :

| Document | Contenu |
|---|---|
| [docs/superpowers/specs/2026-09-16-claude-dashboard-v1-design.md](docs/superpowers/specs/2026-09-16-claude-dashboard-v1-design.md) | La spécification de la v1. Document de référence. |
| [docs/architecture.md](docs/architecture.md) | Architecture technique, intégration SDK, flux d'événements. |
| [docs/ui-spec.md](docs/ui-spec.md) | Spécification détaillée de chaque écran et composant. |
| [docs/design-system.md](docs/design-system.md) | Langage visuel : palettes claire et sombre, typographie, densité, composants, états. |
| [docs/roadmap.md](docs/roadmap.md) | Découpage v1 / v2 / v3 et liste des reports. |
| [docs/superpowers/plans/](docs/superpowers/plans/) | Plans d'implémentation, une tranche par fichier. |

Les maquettes de conception sont conservées dans `.superpowers/brainstorm/`.

## Les trois versions

**v1 — Wrapper mono-session.** Une session Claude Code, pilotée par une
interface qui expose les capacités du CLI sans exiger qu'on les connaisse.

**v2 — Gestion multi-agents.** Vue d'ensemble des sessions ouvertes et de leur
travail. Zoomer sur une session ramène à l'interface de la v1.

**v3 — Orientation workflow dev.** Worktree git par agent avec file de merge,
pipelines visuels, review centralisée des diffs. Voir la roadmap.

## Pile technique

- **Runtime agent** : `@anthropic-ai/claude-agent-sdk` (TypeScript)
- **Serveur** : Node.js, WebSocket pour le flux temps réel
- **Client** : application web, servie en local

Le choix du SDK plutôt que du wrapping de subprocess CLI est motivé dans
[docs/architecture.md](docs/architecture.md#pourquoi-le-sdk-et-pas-le-cli).

## Principes de conception

Trois règles ont tranché chaque arbitrage d'interface :

1. **La conversation est reine.** Tout ce qui n'est pas du texte d'agent vit
   ailleurs. Les appels d'outils ne polluent jamais le fil.
2. **Le haut sert à agir, le bas sert à savoir.** La barre supérieure ne
   contient que du cliquable, le pied de page que de l'état.
3. **Rien n'est visible en permanence sans l'avoir mérité.** Tout panneau
   secondaire est replié par défaut ; une information consultée rarement vit
   derrière un geste, pas à l'écran.
