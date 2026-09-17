# Architecture

Ce document décrit comment le Claude Dashboard s'articule techniquement. Pour
les décisions d'interface, voir [ui-spec.md](ui-spec.md) ; pour le périmètre,
voir le [spec v1](superpowers/specs/2026-09-16-claude-dashboard-v1-design.md).

## Vue d'ensemble

```
┌─────────────────────────────────────────────────┐
│  Navigateur — application web                   │
│  Conversation · barre latérale · pied de page   │
└───────────────────────┬─────────────────────────┘
                        │ WebSocket
┌───────────────────────┴─────────────────────────┐
│  Serveur Node local                             │
│  ┌───────────────────────────────────────────┐  │
│  │ Gestionnaire de session                   │  │
│  │  · file de messages entrants              │  │
│  │  · arbitrage des approbations             │  │
│  │  · état dérivé (contexte, coût, fichiers) │  │
│  └──────────────────┬────────────────────────┘  │
│                     │                           │
│  ┌──────────────────┴────────────────────────┐  │
│  │ Claude Agent SDK                          │  │
│  │  harnais Claude Code, outils intégrés     │  │
│  └───────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────┘
                        │
             Système de fichiers · git · MCP
```

Le serveur est le seul à parler au SDK. Le client ne fait que rendre un état et
émettre des intentions. Cette séparation permet plus tard d'ouvrir plusieurs
onglets sur la même session, ou d'empaqueter le client dans une application
desktop, sans toucher au cœur.

## Pourquoi le SDK et pas le CLI

Deux substrats étaient possibles : piloter des sous-processus `claude` en mode
headless, ou héberger le harnais via `@anthropic-ai/claude-agent-sdk`.

Le SDK a été retenu pour trois raisons.

**La session est réellement longue et bidirectionnelle.** Le SDK accepte un
itérable asynchrone de messages utilisateur comme prompt : on ouvre le flux une
fois et on y pousse les messages au fil de l'eau. En headless, `claude -p` est
un aller-retour par invocation ; tenir une conversation imposerait un `--resume`
à chaque tour, avec le coût et la latence de rechargement que cela implique.

**Les approbations sont interceptables proprement.** Le SDK expose un callback
d'autorisation appelé avant chaque usage d'outil soumis à permission. Le
serveur peut y suspendre l'exécution, pousser la demande au client, attendre la
décision de l'utilisateur, et rendre le verdict. Côté CLI, l'équivalent passe
par un outil MCP dédié dont la sémantique est peu documentée.

**Les messages sont typés.** Le SDK rend des objets ; le CLI rend un flux
JSON ligne à ligne dont le schéma n'est pas contractuel entre versions.

Le prix de ce choix : les sessions vivent dans le serveur du dashboard, pas
dans un terminal Claude Code. Une session lancée ailleurs n'est pas pilotable
depuis l'interface — seulement listable, voir plus bas.

## Le gestionnaire de session

C'est le composant central. Il possède une session et rien d'autre ; la v2 en
instanciera plusieurs.

Ses responsabilités :

**Tenir le flux d'entrée.** Une file de messages utilisateur alimente
l'itérable asynchrone passé au SDK. Envoyer un message depuis l'interface
revient à pousser dans cette file.

**Arbitrer les approbations.** Quand le SDK demande l'autorisation d'utiliser un
outil, le gestionnaire crée une demande en attente, la diffuse au client, et
bloque jusqu'à la réponse. Il consulte d'abord la liste des permissions
persistantes : si l'outil y figure, il répond sans déranger l'utilisateur.

**Dériver l'état.** Le coût, la consommation de contexte, la liste des fichiers
modifiés et l'état git ne sont pas des messages : ce sont des agrégats
recalculés au fil des événements et poussés au client quand ils changent.

**Appliquer les changements à chaud.** Modèle, effort et mode de permission
peuvent changer en cours de session. Le gestionnaire applique la demande du
client via les méthodes de contrôle du SDK.

## Le protocole client-serveur

Un WebSocket, deux directions.

**Serveur vers client** — des événements décrivant ce qui se passe :

| Événement | Contenu |
|---|---|
| `session.state` | État complet, envoyé à la connexion et après reprise |
| `message.delta` | Fragment de texte de l'agent, pour le streaming |
| `message.complete` | Un message terminé |
| `tool.activity` | Un appel d'outil, pour la section Activité |
| `permission.request` | Une demande d'approbation en attente |
| `permission.resolved` | Une demande tranchée, avec sa décision |
| `workflow.checkpoint` | Une étape franchie, ou une barrière atteinte |
| `files.changed` | La liste des fichiers modifiés a évolué |
| `git.state` | Branche, fichiers modifiés, fichiers en stage |
| `context.usage` | Ventilation et total de la fenêtre de contexte |
| `cost.usage` | Coût cumulé de la session |

**Client vers serveur** — des intentions :

| Commande | Effet |
|---|---|
| `message.send` | Pousser un message utilisateur |
| `session.interrupt` | Interrompre la génération en cours |
| `runtime.set` | Changer modèle, effort ou mode de permission |
| `permission.respond` | Trancher une demande en attente |
| `workflow.start` | Lancer un workflow |
| `workflow.resume` | Lever une barrière |
| `context.compact` | Déclencher un compactage |

Le principe : **le serveur pousse de l'état, le client pousse des intentions.**
Le client ne calcule jamais un état qu'il pourrait recevoir.

## L'état dérivé

Quatre agrégats méritent d'être explicités, parce qu'aucun n'est fourni tel
quel par le SDK.

**Le coût.** Le SDK rapporte un coût dans son message de résultat, en fin de
tour. Le total de session est l'accumulation de ces valeurs. Ce sont des
estimations côté client, pas une facturation.

**Le contexte.** Ce n'est finalement pas un agrégat à construire :
`query.getContextUsage({detail})` rend la ventilation complète — `categories[]`,
`mcp_tools[]` avec les tokens par outil et par serveur, `memory_files[]` pour
les CLAUDE.md, `agents[]`, `skills[]`, plus `total_tokens`, `raw_max_tokens` et
`percentage`. Utiliser `detail: 'summary'` pour rafraîchir la jauge, qui répond
depuis la dernière réponse sans appel de comptage, et `'full'` uniquement à
l'ouverture du popover.

**Les fichiers modifiés.** Deux sources possibles : les outils d'édition
observés pendant la session, ou l'état git du dossier. La seconde est la bonne :
elle reste juste si un fichier est modifié hors de l'application, et elle
survit à une reprise de session.

**L'état git.** Branche, fichiers modifiés, fichiers en stage, obtenus en
interrogeant le dépôt. À rafraîchir sur événement de système de fichiers plutôt
qu'en interrogeant en boucle.

## Les sessions reprenables

L'écran d'accueil doit lister les sessions existantes avec leurs métadonnées.

Le serveur tient son propre index des sessions qu'il a créées — c'est la source
qui fait foi. Les transcripts de Claude Code dans `~/.claude/projects` peuvent
compléter cette liste pour les sessions lancées ailleurs, à condition de
traiter leur lecture comme **opportuniste** : le format est interne, non
contractuel, et change entre versions. Toute lecture doit tolérer des champs
manquants et échouer silencieusement, sans jamais bloquer l'affichage de
l'accueil.

Une session lancée hors du dashboard est listable mais pas reprenable en v1.

## Surface réelle du SDK

Vérifiée contre `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`.

`query({ prompt, options })` rend un objet `Query` qui étend
`AsyncGenerator<SDKMessage, void>`. Le `prompt` accepte une chaîne ou un
`AsyncIterable<SDKUserMessage>` ; c'est la seconde forme qui donne la session
longue.

Les méthodes de contrôle utiles, disponibles uniquement en mode d'entrée
streaming :

| Méthode | Usage |
|---|---|
| `interrupt()` | Arrêter la génération en cours |
| `setModel(model?)` | Changer de modèle à chaud |
| `setPermissionMode(mode)` | Changer de mode de permission à chaud |
| `applyFlagSettings({effortLevel})` | Changer le niveau d'effort |
| `getContextUsage({detail})` | Ventilation du contexte |
| `supportedModels()` | Peupler le sélecteur de modèle |
| `supportedAgents()` | Peupler la liste des subagents |
| `supportedCommands()` | Peupler la palette |
| `mcpServerStatus()` | Alimenter la colonne Extensions |
| `initializationResult()` | État d'init, dont `apiKeySource` |

`PermissionMode` vaut
`'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'`.

**Authentification.** Le SDK lance le binaire Claude Code en sous-processus et
hérite de sa résolution de credentials. `apiKeySource: 'none'` signifie login
OAuth claude.ai : l'abonnement fonctionne sans clé API.

## Ce qui n'est pas décidé

Le comportement de l'interface en largeur réduite. Rien d'autre ne reste
ouvert.

## Persistance

Le dashboard a besoin de stocker, hors des sessions elles-mêmes :

- la liste des permissions persistantes accordées par outil,
- les prompts enregistrés,
- les workflows enregistrés,
- les favoris épinglés,
- les dossiers récents.

Du stockage local simple suffit ; aucune de ces données ne justifie une base de
données. Elles doivent rester lisibles et éditables à la main.
