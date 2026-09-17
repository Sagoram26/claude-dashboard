# Claude Dashboard v1 — Spécification

Date : 2026-09-16
Statut : validé, prêt pour le plan d'implémentation

## 1. Contexte

Claude Code en ligne de commande expose une surface de contrôle complète :
choix du modèle, niveau d'effort, mode de permission, skills, subagents,
serveurs MCP, hooks, gestion du contexte. Rien ne manque côté capacités.

Ce qui manque est ailleurs. Le TUI oblige à connaître des commandes pour
atteindre ces réglages, mélange le texte de l'agent avec les appels d'outils
dans un flux unique, et ne montre ni l'état du contexte ni ce que coûte la
session. L'application desktop et l'extension VS Code sont plus accessibles
mais n'exposent qu'une fraction de la surface.

L'objectif de ce projet n'est donc pas d'écrire un nouveau runtime d'agent,
mais de construire une interface à la hauteur de ce que le harnais sait déjà
faire.

Quatre irritants ont été nommés explicitement et orientent tout le design :

1. Un seul agent visible à la fois, d'où le jonglage entre terminaux.
2. Le contrôle est laborieux : changer de modèle, d'effort ou de mode de
   permission passe par des commandes.
3. Aucune vue d'ensemble : ni coût, ni contexte consommé, ni fichiers touchés.
4. La sortie est illisible : texte, appels d'outils, diffs et logs dans un seul
   flux où l'on perd le fil.

## 2. Périmètre de la v1

La v1 traite **une seule session à la fois**. Le multi-agents est la v2.

### Dans le périmètre

- Écran d'accueil listant les dossiers récents et les sessions reprenables.
- Session unique : envoyer des messages, lire les réponses, interrompre.
- Contrôles runtime modifiables à chaud : modèle, effort, mode de permission.
- Demandes d'approbation traitées depuis l'interface, avec mémorisation
  possible par outil.
- Visibilité sur les skills, serveurs MCP et hooks chargés.
- Trois objets de travail distincts : Process, Prompts, Workflows.
- Barre latérale à trois colonnes : fichiers modifiés et favoris, extensions,
  lancement.
- Pied de page d'état : branche git, fichiers modifiés, stage, jauge de
  contexte, coût, état de connexion.
- Popover de détail du contexte, avec action de compactage.

### Hors périmètre, reporté

| Fonctionnalité | Version |
|---|---|
| Fan-out : une mission éclatée sur plusieurs subagents | v2 |
| Fork de session | v2 |
| Vue d'ensemble multi-agents | v2 |
| Édition de CLAUDE.md depuis l'interface | non planifié |
| Toggles allow/deny par outil, en dehors du flux d'approbation | non planifié |
| Worktree git par agent, pipelines visuels, review centralisée | v3 |

## 3. Décisions de conception

Chaque décision ci-dessous a été validée sur maquette. Les alternatives
écartées sont mentionnées quand le choix mérite d'être compris plus tard.

### 3.1 Structure générale

Trois zones : une barre supérieure, un corps à deux colonnes, un pied de page.

La colonne principale porte la conversation et occupe toute la largeur
disponible. Une unique barre latérale à droite porte tout le reste.

**La règle qui tranche** : le haut sert à agir, le bas sert à savoir. La barre
supérieure ne contient que des éléments cliquables ; le pied de page ne
contient que de l'état, jamais de commande. Cette séparation rend les deux
lisibles même quand ils sont denses.

*Écarté* : un rail de contrôles à gauche en plus de la barre de droite. Trois
colonnes étranglent la conversation et saturent l'écran.

### 3.2 La conversation

La colonne centrale ne contient que le texte de l'agent, les messages de
l'utilisateur, les checkpoints de workflow et les demandes d'approbation.

**Les appels d'outils n'apparaissent jamais dans le fil.** Ils sont réduits à
des lignes minimales dans la section Activité de la barre latérale, repliée par
défaut. C'est une décision explicite : le détail des appels d'outils n'a pas de
valeur de lecture courante.

Les checkpoints de workflow, eux, appartiennent au fil : franchir une étape est
un événement chronologique, sa place est dans le récit.

### 3.3 La barre latérale — trois colonnes

Un sélecteur de trois icônes en tête de barre. Chaque colonne n'est faite que
de menus repliables, ce qui permet à une colonne entièrement fermée de tenir en
quelques lignes.

**Colonne Accueil**
- Fichiers modifiés — un par ligne avec son delta (`api.ts +24 −6`), un total
  en en-tête.
- Favoris — ce que l'utilisateur épingle parmi les prompts, subagents et
  process.
- Activité — les appels d'outils, repliée par défaut, avec un compteur.

**Colonne Skills et MCP**
- Skills — nom et pastille actif/inactif.
- Serveurs MCP — nom, nombre d'outils exposés, état (connecté, hors ligne).
- Hooks — repliée, en lecture seule.

**Colonne Lancer**
- Prompts — la bibliothèque de prompts réutilisables.
- Subagents — les agents invocables, avec l'entrée fan-out prévue mais désactivée
  en v1.
- Workflows — les séquences d'étapes enregistrées.

### 3.4 Le pied de page

Contenu, de gauche à droite : branche git, nombre de fichiers modifiés, nombre
de fichiers en stage, puis le nom du projet, puis un rappel de ce qui est chargé
(`7 skills · 3 MCP`), la jauge de contexte, le coût cumulé, l'état de connexion.

Chaque zone est cliquable et mène à l'endroit correspondant : la jauge ouvre le
popover de contexte, le rappel des extensions bascule la barre latérale sur la
colonne concernée.

En v1, l'état git est **informatif**. Stage, commit et diff depuis l'interface
ne sont pas au programme.

### 3.5 Le contexte

La jauge du pied de page donne le pourcentage consommé. Le détail s'ouvre en
popover et ventile la fenêtre par origine : CLAUDE.md, outils et MCP, fichiers
lus, conversation. Chaque ligne porte sa taille en tokens.

Le popover porte une action de compactage.

**Pourquoi ça compte** : c'est précisément l'information que le TUI ne montre
pas, et c'est elle qui permet de comprendre pourquoi une session devient chère
ou lente.

### 3.6 Les demandes d'approbation

C'est une nécessité fonctionnelle, pas une option : en mode de permission
manuel, une session sans traitement des approbations se bloque.

Le traitement retenu combine deux surfaces :

1. **Le détail complet vit dans le fil**, à sa place chronologique. Il montre
   l'outil, sa cible, et le contenu exact — la commande pour Bash, le diff pour
   Edit. Il reste après coup, ce qui donne un historique gratuit de ce qui a
   été autorisé et quand.
2. **Une ligne de rappel ancrée au-dessus de la saisie** n'existe que pendant
   l'attente. Elle permet de répondre sans remonter le fil, et disparaît une
   fois la décision prise.

Trois réponses possibles : autoriser une fois, autoriser toujours pour cet
outil, refuser en donnant une raison.

« Toujours pour cet outil » alimente une **liste de permissions persistantes**,
consultable et révocable depuis l'écran de réglages. Sans cet écran de gestion,
l'option serait un piège : on accorde une permission qu'on ne sait plus retirer.

### 3.7 Les trois objets de travail

Trois objets distincts, délibérément non fusionnés.

**Process** — un skill ou une méthode de travail injectée au démarrage de la
session (TDD, brainstorming, débogage systématique). Se choisit dans la barre
supérieure et reste visible pendant toute la session.

**Prompts** — une bibliothèque de prompts réutilisables, lancés en un clic
depuis la colonne Lancer ou depuis la palette.

**Workflows** — une séquence d'étapes suivies dans l'ordre.

### 3.8 Les workflows

Chaque étape porte sa propre configuration : modèle, mode de permission,
subagent dédié. C'est ce qui rend un workflow intéressant au-delà de
l'organisation — explorer avec un petit modèle, planifier avec un gros,
implémenter en acceptEdits.

Chaque étape porte aussi une **barrière optionnelle**. Une étape marquée
« attend » suspend l'exécution à sa fin et demande un feu vert ; les autres
enchaînent. La barrière se place là où le risque est réel, typiquement après
une implémentation, pas après une exploration.

La progression se lit dans le fil sous forme de checkpoints. Un rappel compact
de l'étape courante (`▸ étape 2/3`) vit dans la barre supérieure.

*Écarté* : la barrière systématique à chaque étape, qui remet l'utilisateur en
goulot d'étranglement — exactement ce qu'un workflow cherche à éviter.

### 3.9 L'écran d'accueil

L'application ouvre sur un écran d'accueil, pas directement sur une session.

Il contient un champ pour ouvrir un dossier, une grille de sessions
reprenables, et la liste des dossiers récents. Chaque carte de session porte le
nom du projet, un indicateur vivant/au repos, la branche, le nombre de fichiers
modifiés, la date de dernière activité et le coût cumulé.

**Pourquoi cet écran plutôt qu'une reprise directe** : c'est la fondation de la
v2. La grille de cartes se densifiera en vue d'ensemble multi-agents sans
changer de nature.

En v1, reprendre une session repart du transcript complet. Le fork est reporté.

## 4. Architecture

Le détail vit dans [architecture.md](../../architecture.md). Les points
structurants :

**Substrat** : le Claude Agent SDK en TypeScript, pas le wrapping de subprocess
CLI. Trois raisons décisives :

- Le SDK accepte un `AsyncIterable` de messages utilisateur comme prompt, ce
  qui donne une session longue et réellement bidirectionnelle. `claude -p` est
  un aller-retour par invocation et imposerait un `--resume` à chaque tour.
- Un callback d'autorisation permet d'intercepter chaque demande de permission
  et d'y répondre depuis l'interface. C'est la brique qui rend possible la
  section 3.6, et elle n'a pas d'équivalent simple côté CLI.
- Les messages arrivent en objets typés, sans parsing d'un flux JSON dont le
  format n'est pas contractuel.

**À ne pas faire** : lire les transcripts `.jsonl` de `~/.claude/projects` comme
source primaire. Le format est interne et change entre versions. Ils peuvent
servir à peupler la liste des sessions reprenables de l'écran d'accueil, avec
une tolérance aux champs manquants.

**Forme** : un serveur Node local héberge les sessions et expose un WebSocket ;
le client est une application web servie en local. Un empaquetage desktop reste
possible plus tard sans remettre en cause ce découpage.

## 5. Vérification

Aucun de ces points ne se valide par une revue de code seule. Chacun demande
une session réelle.

**Session de base**
1. Ouvrir l'accueil, choisir un dossier, démarrer une session.
2. Envoyer un message, vérifier que la réponse arrive en streaming.
3. Vérifier qu'aucun appel d'outil n'apparaît dans le fil, et qu'ils sont tous
   comptés dans Activité.
4. Interrompre une réponse en cours, vérifier que la session reste utilisable.

**Contrôles à chaud**
5. Changer de modèle en cours de session, envoyer un message, vérifier dans le
   pied de page que le coût évolue au tarif du nouveau modèle.
6. Changer le niveau d'effort et le mode de permission, vérifier la prise en
   compte au tour suivant.

**Approbations**
7. Passer en mode manuel, déclencher une action qui exige une approbation.
8. Vérifier que le bloc apparaît dans le fil avec le contenu exact, et que la
   ligne de rappel apparaît au-dessus de la saisie.
9. Autoriser, vérifier que l'action s'exécute et que le rappel disparaît.
10. Refuser avec une raison, vérifier que l'agent la reçoit et s'adapte.
11. Choisir « toujours pour cet outil », vérifier que la demande suivante pour
    ce même outil ne bloque plus, puis révoquer depuis les réglages et vérifier
    que le blocage revient.

**Contexte et état**
12. Ouvrir le popover de contexte, vérifier que la ventilation est cohérente
    avec la session et que le total correspond à la jauge.
13. Déclencher un compactage, vérifier que la jauge redescend et que la session
    continue sans perdre le fil.
14. Modifier un fichier hors de l'application, vérifier que le pied de page et
    la liste des fichiers modifiés se mettent à jour.

**Workflows**
15. Créer un workflow de trois étapes avec un modèle différent par étape et une
    barrière sur la deuxième.
16. Le lancer, vérifier que chaque étape s'exécute avec son propre modèle.
17. Vérifier que l'exécution suspend à la barrière et reprend au feu vert.
18. Vérifier que les checkpoints apparaissent dans le fil et que le rappel de
    l'étape courante est juste dans la barre supérieure.

**Reprise**
19. Fermer l'application, la rouvrir, vérifier que la session apparaît dans
    l'accueil avec des métadonnées justes.
20. La reprendre, vérifier que l'agent a bien le contexte de l'échange
    précédent.

## 6. Vérifications effectuées

Les deux inconnues signalées lors de la conception ont été levées en installant
`@anthropic-ai/claude-agent-sdk` et en lisant ses définitions de types. Une des
réponses améliore le design.

**Le callback d'autorisation.** `CanUseTool` prend des arguments
**positionnels** `(toolName, input, options)` et retourne
`Promise<PermissionResult | null>`, où `PermissionResult` vaut
`{behavior:'allow', updatedInput?, updatedPermissions?}` ou
`{behavior:'deny', message, interrupt?}`.

Les `options` fournissent plus que prévu : `suggestions` (les règles de
permission à renvoyer pour « toujours autoriser »), `title` (la phrase d'invite
déjà rédigée), `displayName`, `description`, `toolUseID`, `requestId`,
`blockedPath` et `suppressAlwaysAllowRule`.

Trois conséquences pour la section 3.6 :
- Le bouton « Toujours pour cet outil » renvoie `options.suggestions` en
  `updatedPermissions` ; rien à construire à la main.
- Ce bouton doit être **masqué** quand `suppressAlwaysAllowRule` est vrai : la
  règle qu'il écrirait accorderait plus que l'action demandée.
- Le texte d'invite affiché vient de `options.title`, pas d'une reconstruction
  à partir du nom d'outil et de son entrée.

Ne jamais retourner `null` : cela signifie pour le SDK que la réponse a été
envoyée hors bande, et laisse l'outil bloqué indéfiniment.

**La ventilation du contexte est native.** `query.getContextUsage({detail})`
rend `total_tokens`, `raw_max_tokens`, `percentage`, un éventuel `over_limit`,
puis `categories[]`, `mcp_tools[]` avec les tokens par outil et par serveur,
`memory_files[]` pour les CLAUDE.md, `agents[]` et `skills[]`.

**Le repli « total seul » prévu en section 3.5 est donc caduc** — il ne doit pas
être implémenté. Le popover peut être plus riche que ce qui avait été dessiné.
`detail: 'summary'` répond depuis la dernière réponse et des estimations
locales ; `'full'` compte chaque catégorie via l'API de comptage. Utiliser
`'summary'` pour la jauge et `'full'` à l'ouverture du popover.

**L'authentification est résolue.** Le SDK lance le binaire Claude Code en
sous-processus et hérite de sa résolution de credentials. Le message système
d'init porte `apiKeySource`, dont la valeur `'none'` signifie login OAuth
claude.ai. L'abonnement Claude Code fonctionne sans clé API.

**Bonus non anticipé.** `supportedModels()`, `supportedAgents()`,
`supportedCommands()` et `mcpServerStatus()` existent sur l'objet `Query`. Toute
la colonne Extensions de la section 3.3 est alimentée nativement : rien à
parser, rien à inventer.

Les modes de permission réels sont
`'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'`.
