# Roadmap

Trois versions, chacune avec son propre cycle spécification puis plan puis
implémentation. Ce document fixe le découpage et garde trace de ce qui a été
reporté et pourquoi.

## v1 — Wrapper mono-session

**En cours de conception.** Voir le
[spec](superpowers/specs/2026-09-16-claude-dashboard-v1-design.md).

Une session Claude Code, pilotée par une interface qui expose les capacités du
CLI sans exiger qu'on les connaisse par cœur.

Le critère de réussite : pouvoir mener une session de travail complète sans
ouvrir de terminal, et comprendre à tout moment ce que l'agent fait, ce qu'il a
changé, ce qu'il coûte et ce qu'il a en contexte.

## v2 — Gestion multi-agents

Vue d'ensemble des sessions ouvertes et de leur travail. Zoomer sur une session
ramène à l'interface de la v1.

La fondation existe déjà en v1 : la grille de cartes de l'écran d'accueil est
conçue pour se densifier sans changer de nature.

Contenu prévu :

**Fan-out.** Une mission éclatée sur plusieurs subagents en parallèle, suivis
dans une carte unique du fil avec l'état de chacun. L'entrée existe déjà dans la
colonne Lancer de la v1, désactivée.

**Fork de session.** Repartir d'une copie d'une session pour tester une autre
direction sans abîmer l'originale.

**Vue d'ensemble.** Plusieurs sessions vivantes visibles simultanément, avec
leur état, leur coût et leur activité.

Question ouverte pour cette version : plusieurs agents travaillant sur le même
dépôt se marchent dessus. Le worktree par agent, prévu en v3, répond à ce
problème — il faudra décider s'il doit remonter en v2.

## v3 — Orientation workflow dev

Candidats, classés par valeur décroissante. Rien n'est arbitré.

**Worktree git par agent, avec file de merge.** Chaque agent travaille dans son
propre worktree ; le dashboard montre les diffs de tous les agents côte à côte
et permet d'approuver et de fusionner depuis l'interface. C'est le chaînon
manquant du parallélisme réel : aujourd'hui, lancer trois agents sur le même
dépôt garantit les conflits. S'appuie sur `git worktree`, qui existe déjà.

**Pipelines visuels.** Un éditeur de graphe où la sortie d'un agent devient
l'entrée du suivant, avec conditions et étapes de vérification. Les workflows de
la v1 en sont la version linéaire ; ceci en est la généralisation.

**Review centralisée des diffs.** Tous les changements de tous les agents dans
une vue unique, avec approbation par fichier. Complémentaire du worktree.

**Mémoire partagée.** Les agents écrivent dans un graphe de connaissances commun
plutôt que chacun dans sa propre mémoire.

**Presets d'agents.** Des configurations réutilisables — modèle, outils, skills,
prompt système — lançables en un clic et partageables.

**Replay de session.** Rejouer une session pas à pas pour comprendre où elle a
dérapé, et repartir depuis n'importe quel point.

## Reports et arbitrages

Ce qui a été explicitement écarté de la v1, et pourquoi.

| Élément | Décision | Raison |
|---|---|---|
| Fan-out multi-agents | v2 | Relève du multi-agents, pas du wrapper mono-session |
| Fork de session | v2 | Confort, pas fondation |
| Appels d'outils dans le fil | Écarté | Aucune valeur de lecture courante ; relégués dans Activité, replié |
| Toggles allow/deny par outil | Écarté | Le flux d'approbation avec « toujours pour cet outil » couvre le besoin |
| Édition de CLAUDE.md dans l'interface | Écarté | Un éditeur de texte fait déjà le travail |
| Git actionnable — stage, commit, diff | Écarté de la v1 | L'état informatif suffit ; l'action relève de la review centralisée en v3 |
| Barrière systématique entre étapes | Écarté | Remet l'utilisateur en goulot, ce qu'un workflow cherche à éviter |
| Rail de contrôles à gauche | Écarté | Trois colonnes étranglent la conversation |
| Lecture des transcripts comme source primaire | Écarté | Format interne non contractuel ; usage opportuniste seulement |

## Prochaines étapes

Les deux inconnues techniques sont levées : signatures réelles du SDK vérifiées
contre le paquet installé, authentification résolue (l'abonnement Claude Code
suffit). Les plans sont écrits dans
[superpowers/plans/](superpowers/plans/).

Reste à exécuter la tranche 1, puis à détailler la tranche 2 avec ce que la
première aura appris.

Le langage visuel est défini dans [design-system.md](design-system.md). Seul le
comportement en largeur réduite reste à trancher.
