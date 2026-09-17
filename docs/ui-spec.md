# Spécification d'interface

Ce document décrit chaque écran et chaque composant de la v1, avec ses états.
Il ne fixe pas encore le langage visuel — couleurs, typographie et densité
réelle font l'objet d'une passe de finition séparée. Ce qui est fixé ici, c'est
la structure et le comportement.

Les maquettes de validation sont conservées dans `.superpowers/brainstorm/`.

## Principes

Trois règles ont tranché chaque arbitrage. Elles restent valables pour toute
décision future non couverte par ce document.

1. **La conversation est reine.** Tout ce qui n'est pas du texte d'agent, un
   message utilisateur, un checkpoint ou une demande d'approbation vit ailleurs.
2. **Le haut sert à agir, le bas sert à savoir.** La barre supérieure ne
   contient que du cliquable ; le pied de page ne contient que de l'état.
3. **Rien n'est visible en permanence sans l'avoir mérité.** Tout panneau
   secondaire est replié par défaut.

---

## Écran 1 — Accueil

Le point d'entrée de l'application. En v2, cet écran deviendra la vue
d'ensemble multi-agents ; sa structure est déjà pensée pour ça.

### Composition

**En-tête** : le nom de l'application à gauche, l'accès aux réglages à droite.

**Champ d'ouverture** : permet d'ouvrir un dossier de travail, par saisie de
chemin ou par sélection.

**Section « Reprendre »** : une grille de cartes de session. C'est la zone qui
se densifiera en v2.

**Section « Dossiers récents »** : une liste simple de chemins déjà ouverts.

**Pied d'écran** : un bouton principal « Nouvelle session », un bouton
secondaire « Ouvrir un dossier ».

### La carte de session

Chaque carte porte, dans cet ordre de lecture :

| Élément | Détail |
|---|---|
| Indicateur d'état | Vivant ou au repos, en pastille colorée |
| Nom du projet | Le nom du dossier |
| Branche git | Nom de la branche courante |
| Fichiers modifiés | Compteur, mis en évidence si non nul |
| Dernière activité | En temps relatif — « il y a 3 min », « hier » |
| Coût cumulé | En dollars |
| Barre de progression | Aperçu de la consommation de contexte |

Un clic sur une carte reprend la session.

### États

**Aucune session** : la section « Reprendre » disparaît entièrement plutôt que
d'afficher un cadre vide. Le champ d'ouverture prend la place.

**Dossier inaccessible** : une carte dont le dossier n'existe plus reste
listée, grisée, avec la possibilité de la retirer de la liste.

**Session lancée hors du dashboard** : listable, mais non reprenable en v1. La
carte l'indique explicitement plutôt que d'échouer au clic.

---

## Écran 2 — Session

L'écran principal. Trois zones : barre supérieure, corps à deux colonnes, pied
de page.

### 2.1 Barre supérieure

De gauche à droite :

| Élément | Comportement |
|---|---|
| Retour à l'accueil | Une icône, ramène à l'écran 1 sans fermer la session |
| Modèle | Menu déroulant, changeable à chaud |
| Effort | Menu déroulant, changeable à chaud |
| Mode de permission | Menu déroulant, changeable à chaud |
| Process actif | Le process injecté au démarrage, changeable |
| Étape courante | Visible uniquement si un workflow tourne — `▸ étape 2/3` |
| Palette de commandes | Rappel du raccourci |
| Réglages | Une icône, ouvre l'écran 3 |

Le mode de permission change d'aspect selon sa valeur : un mode permissif reste
discret, un mode manuel se signale, parce qu'il implique que la session peut
s'arrêter en attente.

L'indicateur d'étape courante n'existe pas hors workflow. Il n'occupe pas de
place réservée.

### 2.2 Colonne de conversation

Contient exclusivement :

**Messages utilisateur** — distingués visuellement des messages d'agent, sans
fioriture.

**Messages d'agent** — en streaming, le texte apparaît au fil de la génération.

**Checkpoints de workflow** — une ligne compacte marquant une étape franchie,
avec son nom, le modèle utilisé et la durée. Une étape en cours se distingue
d'une étape terminée. Une barrière atteinte porte ses boutons de décision.

**Demandes d'approbation** — voir 2.5.

Ne contient jamais : les appels d'outils, les résultats d'outils, les logs.

**Zone de saisie**, en bas :
- le champ de texte, qui s'étend sur plusieurs lignes au besoin ;
- au-dessus, la ligne de rappel d'approbation, présente seulement en attente.

**États** :
- *Agent en génération* : un indicateur d'activité, et la possibilité
  d'interrompre.
- *Agent au repos* : saisie disponible.
- *En attente d'approbation* : la saisie reste utilisable, mais le rappel est
  présent et visible.
- *Session déconnectée* : la saisie est désactivée, le pied de page l'indique.

### 2.3 Barre latérale

Un sélecteur de trois icônes en tête. Le contenu de chaque colonne n'est fait
que de sections repliables, avec un compteur en en-tête.

L'état déplié ou replié de chaque section est mémorisé entre les sessions.

#### Colonne Accueil

| Section | Contenu | État par défaut |
|---|---|---|
| Fichiers modifiés | Un fichier par ligne avec son delta, total en en-tête | Dépliée |
| Favoris | Prompts, subagents et process épinglés | Dépliée |
| Activité | Les appels d'outils, une ligne chacun | Repliée |

La section Fichiers reflète l'état git du dossier, pas seulement ce que l'agent
a édité : un fichier modifié à l'extérieur y apparaît.

La section Favoris porte une entrée pour épingler un nouvel élément.

La section Activité est délibérément repliée. Son compteur suffit à savoir
qu'il se passe quelque chose ; le détail n'a pas de valeur de lecture courante.

#### Colonne Skills et MCP

| Section | Contenu | État par défaut |
|---|---|---|
| Skills | Nom et pastille actif/inactif | Dépliée |
| Serveurs MCP | Nom, nombre d'outils, état de connexion | Dépliée |
| Hooks | Liste en lecture seule | Repliée |

Quand la liste de skills dépasse ce qui tient raisonnablement, une entrée
« voir les N autres » évite de faire défiler.

Un serveur MCP hors ligne est signalé comme tel plutôt que masqué : c'est
souvent l'explication d'un comportement inattendu.

#### Colonne Lancer

| Section | Contenu | État par défaut |
|---|---|---|
| Prompts | La bibliothèque de prompts réutilisables | Dépliée |
| Subagents | Les agents invocables | Dépliée |
| Workflows | Les séquences enregistrées | Dépliée |

L'entrée fan-out figure dans la section Subagents mais reste désactivée en v1,
avec une mention de sa disponibilité en v2.

### 2.4 Pied de page

Ne contient que de l'état. Chaque zone est cliquable et mène à l'endroit
correspondant.

| Zone | Contenu | Au clic |
|---|---|---|
| Git | Branche, fichiers modifiés, fichiers en stage | Colonne Accueil |
| Projet | Nom du dossier | Rien |
| Extensions | `7 skills · 3 MCP` | Colonne Skills et MCP |
| Contexte | Jauge et pourcentage | Ouvre le popover de contexte |
| Coût | Total cumulé en dollars | Rien |
| Connexion | État de la liaison au serveur | Rien |

La jauge de contexte change d'aspect en approchant de la limite. C'est le seul
élément du pied de page qui attire activement l'œil, et seulement quand il le
faut.

### 2.5 Demande d'approbation

Deux surfaces complémentaires.

#### Le bloc dans le fil

À sa place chronologique, il reste après la décision. Il porte :

- **En-tête** : le nom de l'outil, sa cible quand elle existe (`Edit
  src/api.ts`), et l'état de la demande.
- **Corps** : le contenu exact soumis à approbation — la commande pour Bash, le
  diff coloré pour Edit, le chemin pour Read.
- **Actions** : trois boutons.

| Action | Effet |
|---|---|
| Autoriser | Autorise cette occurrence uniquement |
| Toujours pour cet outil | Ajoute une permission persistante, révocable dans les réglages |
| Refuser + dire pourquoi | Ouvre un champ de raison, transmise à l'agent |

Le raccourci clavier pour autoriser et pour refuser est affiché sur les boutons.

Une fois tranchée, la demande garde sa trace dans le fil avec la décision prise,
ce qui donne un historique gratuit.

#### La ligne de rappel ancrée

Au-dessus de la saisie, présente uniquement pendant l'attente. Elle porte le
nombre de demandes en attente, un bouton pour autoriser directement, et un
bouton pour remonter au bloc correspondant.

Elle disparaît intégralement dès que plus rien n'attend — elle ne laisse pas de
place vide.

### 2.6 Popover de contexte

Ouvert depuis la jauge du pied de page.

**En-tête** : le total consommé sur le total disponible, et une action de
compactage.

**Corps** : une ligne par origine, avec une barre proportionnelle et une taille
en tokens.

| Origine | Ce que ça couvre |
|---|---|
| CLAUDE.md | Les instructions de projet et globales |
| Outils et MCP | Les définitions d'outils exposées au modèle |
| Fichiers lus | Le contenu des fichiers chargés en contexte |
| Conversation | L'historique des échanges |

Cette ventilation est fournie nativement par le SDK, et plus finement que ce
tableau : les serveurs MCP sont détaillés outil par outil, et les skills et
subagents chargés portent aussi leur coût. Le popover peut donc être plus riche
que ce qui est décrit ici.

---

## Écran 3 — Réglages

Accessible depuis la barre supérieure. Il regroupe ce qui se configure, par
opposition à ce qui s'exécute.

| Section | Contenu |
|---|---|
| Permissions accordées | La liste des permissions persistantes, avec révocation |
| Serveurs MCP | Configuration des serveurs |
| Hooks | Consultation des hooks configurés |
| Prompts | Création et édition de la bibliothèque |
| Workflows | Création et édition, voir ci-dessous |
| Process | Choix du process proposé par défaut |

La section « Permissions accordées » n'est pas optionnelle : sans elle,
« Toujours pour cet outil » accorde un droit qu'on ne sait plus retirer.

---

## L'éditeur de workflow

Vit dans les réglages, s'ouvre aussi depuis la colonne Lancer.

### Composition

Un nom, puis une liste ordonnée d'étapes, puis les actions « Lancer » et
« Enregistrer ».

### L'étape

Chaque étape porte :

| Élément | Détail |
|---|---|
| Poignée de déplacement | Pour réordonner |
| Numéro | Position dans la séquence |
| Consigne | Le texte de l'instruction donnée à l'agent |
| Modèle | Le modèle utilisé pour cette étape |
| Mode de permission | Le mode appliqué pendant cette étape |
| Subagent | Optionnel, l'agent chargé de l'étape |
| Barrière | Case à cocher — l'étape attend un feu vert à sa fin |

Le réglage par étape est ce qui donne sa valeur au workflow : explorer avec un
petit modèle, planifier avec un plus capable, implémenter avec un mode de
permission plus permissif.

### Exécution

Pendant l'exécution :

- la barre supérieure affiche l'étape courante ;
- chaque étape franchie dépose un checkpoint dans le fil, avec son modèle et sa
  durée ;
- une étape marquée d'une barrière suspend à sa fin et affiche ses boutons
  « Continuer » et « Corriger » dans le fil ;
- « Corriger » rend la main sans avancer, ce qui permet d'intervenir avant de
  relancer.

---

## Raccourcis clavier

La liste minimale attendue en v1 :

| Raccourci | Effet |
|---|---|
| Palette de commandes | Ouvre la recherche de prompts, skills et subagents |
| Entrée | Autorise la demande en attente, quand il y en a une |
| Échap | Refuse la demande en attente, ou ferme le popover ouvert |
| Interruption | Interrompt la génération en cours |

Tout bouton exposant un raccourci l'affiche.

---

## Langage visuel

Palettes, typographie, échelle d'espacement, dimensions fixes, composants et
états sont définis dans [design-system.md](design-system.md). Le comportement
décrit ci-dessus ne dépend d'aucun de ces choix et reste valable si la palette
évolue.

Reste ouvert : le comportement en largeur réduite, qui n'a pas été tranché.
