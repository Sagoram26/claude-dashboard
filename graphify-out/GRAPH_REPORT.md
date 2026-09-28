# Graph Report - claude-dashboard  (2026-09-24)

## Corpus Check
- 82 files · ~54,230 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: .log 1, (none) 1)

## Summary
- 341 nodes · 464 edges · 43 communities (18 shown, 25 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 21 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Composants UI Conversation
- Client WebSocket
- Concepts Tranche 3/4
- Package Dependances
- Session Manager Serveur
- Protocole Tranche 1
- Docs Racine et Reconnaissance
- Concepts Permissions Tranche 2
- TSConfig Client
- TSConfig Serveur
- DevDependencies
- Script Verify E2E
- Tests Client
- Scripts NPM
- Plans Tranche 1
- Trois Lois de Mise en Page
- Pattern Couture
- Architecture SDK
- Controle de Requete
- Etat Derive Architecture
- Persistance Sessions
- Mode de Permission
- Roadmap V1
- Roadmap V2
- Roadmap V3
- CreateServer Tranche 1
- Contrat Protocole
- Structure Tranche
- Verification E2E
- Design System Couleur
- Design System Spacing
- Design System Typography
- EffortLevel
- PermissionUpdate
- SupportedModels
- Choix Modeles
- Cycle Rouge Vert Revue
- Registre Progress
- ParseClientCommand
- Shell UI Footer
- Shell UI Tokens CSS
- Shell UI TopBar
- Critere de Fin Tranche 1

## God Nodes (most connected - your core abstractions)
1. `Claude Dashboard v1 — Spécification de conception` - 19 edges
2. `compilerOptions` - 13 edges
3. `compilerOptions` - 13 edges
4. `Spécification d'interface (ui-spec.md)` - 11 edges
5. `ServerEvent` - 10 edges
6. `scripts` - 9 edges
7. `vitest` - 8 edges
8. `createSessionManager()` - 7 edges
9. `ApprovalEntry` - 6 edges
10. `FakeWebSocket` - 6 edges

## Surprising Connections (you probably didn't know these)
- `v1 — Wrapper mono-session` --semantically_similar_to--> `Roadmap v1 — Wrapper mono-session`  [INFERRED] [semantically similar]
  README.md → docs/roadmap.md
- `v2 — Gestion multi-agents` --semantically_similar_to--> `Roadmap v2 — Gestion multi-agents`  [INFERRED] [semantically similar]
  README.md → docs/roadmap.md
- `v3 — Orientation workflow dev` --semantically_similar_to--> `Roadmap v3 — Orientation workflow dev`  [INFERRED] [semantically similar]
  README.md → docs/roadmap.md
- `Reports et arbitrages (fonctionnalités écartées de la v1)` --conceptually_related_to--> `Three laws of the layout`  [INFERRED]
  docs/roadmap.md → CLAUDE.md
- `Principes de conception (trois règles)` --conceptually_related_to--> `Three laws of the layout`  [INFERRED]
  README.md → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Tranche 1 feature dependency chain (01→02→03→05→06, 04 in parallel)** — docs_superpowers_plans_tranche1_01_socle_projet, docs_superpowers_plans_tranche1_02_protocole_websocket, docs_superpowers_plans_tranche1_03_session_manager, docs_superpowers_plans_tranche1_04_shell_ui, docs_superpowers_plans_tranche1_05_conversation_streaming, docs_superpowers_plans_tranche1_06_interruption [EXTRACTED 0.95]
- **Three laws of the layout restated across CLAUDE.md, design-system.md and README.md** — claude_trois_lois_mise_en_page, docs_design_system_trois_lois, readme_principes_conception [INFERRED 0.85]
- **End-to-end permission flow: SDK canUseTool → bridge → PermissionRequest → thread entry → pending bar** — docs_environnement_canusetool, docs_superpowers_plans_tranche2_01_createpermissionbridge, docs_superpowers_plans_tranche2_01_permissionrequest_revised, docs_superpowers_plans_tranche2_02_approvalentry, docs_superpowers_plans_tranche2_03_pendingapprovalbar_component [EXTRACTED 0.90]
- **Features de la tranche 3 (contexte, coût, git, barre latérale, popover, accueil, couture)** — docs_superpowers_plans_tranche3_00_reconnaissance, docs_superpowers_plans_tranche3_01_contexte, docs_superpowers_plans_tranche3_02_cout, docs_superpowers_plans_tranche3_03_git_fichiers, docs_superpowers_plans_tranche3_04_barre_laterale, docs_superpowers_plans_tranche3_05_popover_contexte, docs_superpowers_plans_tranche3_06_ecran_accueil, docs_superpowers_plans_tranche3_07_couture [INFERRED 0.85]
- **Features de la tranche 4 (workflows, exécuteur, checkpoints, prompts, palette, couture)** — docs_superpowers_plans_tranche4_00_reconnaissance, docs_superpowers_plans_tranche4_01_modele_workflow, docs_superpowers_plans_tranche4_02_executeur_barrieres, docs_superpowers_plans_tranche4_03_checkpoints, docs_superpowers_plans_tranche4_04_bibliotheque_prompts, docs_superpowers_plans_tranche4_05_palette_commandes, docs_superpowers_plans_tranche4_06_couture [INFERRED 0.85]
- **Motif récurrent de la feature Couture à travers les tranches** — docs_superpowers_plans_tranche2_07_couture, docs_superpowers_plans_tranche3_07_couture, docs_superpowers_plans_tranche4_06_couture, concept_couture_test [INFERRED 0.85]

## Communities (43 total, 25 thin omitted)

### Community 0 - "Composants UI Conversation"
Cohesion: 0.07
Nodes (33): ApprovalBlock(), DECISION_LABEL, describeTarget(), Composer(), Conversation(), Footer(), FooterItem, TONE_COLOR (+25 more)

### Community 1 - "Client WebSocket"
Cohesion: 0.09
Nodes (25): Connection, DISCONNECTED_STATE, ref_node_assert, ref_node_fs, ref_node_http, ref_node_net, ref_node_os, ref_node_path (+17 more)

### Community 2 - "Concepts Tranche 3/4"
Cohesion: 0.12
Nodes (27): Bouton « Toujours pour cet outil », Checkpoint (événement chronologique dans le fil), Palette de commandes (recherche unifiée), Jauge de contexte (getContextUsage), Popover de contexte (ventilation par origine), Accumulation du coût (total_cost_usd), Suivi de l'état git et des fichiers modifiés, Écran d'accueil (dossiers récents, sessions reprenables) (+19 more)

### Community 3 - "Package Dependances"
Cohesion: 0.09
Nodes (21): dependencies, @anthropic-ai/claude-agent-sdk, react, react-dom, ws, description, engines, node (+13 more)

### Community 4 - "Session Manager Serveur"
Cohesion: 0.12
Nodes (19): @anthropic-ai/claude-agent-sdk, ref_node_crypto, createSessionManager(), describeTarget(), handleMessage(), handleStreamEvent(), QueryFn, SessionManager (+11 more)

### Community 5 - "Protocole Tranche 1"
Cohesion: 0.11
Nodes (19): Components (control pill, accordion, approval block, checkpoint, diff, context meter, session card), Motion (almost none, generating indicator exception), CanUseTool (sdk.d.ts:205-298), Écarts avec le spec v1 (PermissionRequest incomplet), PermissionResult (sdk.d.ts:2389-2401), type ClientCommand, type ServerEvent, createSessionManager(opts): SessionManager (+11 more)

### Community 6 - "Docs Racine et Reconnaissance"
Cohesion: 0.13
Nodes (13): CLAUDE.md — conventions du projet, Feature de reconnaissance d'environnement, client/index.html — point d'entrée client, docs/environnement.md — Environnement réel, PROCESS.md — Procédé de développement, Les doubles de test sont un livrable (FakeWebSocket partagé), Tranche2.md — Permissions et contrôles, Feature 00 — Reconnaissance d'environnement (tranche 2) (+5 more)

### Community 7 - "Concepts Permissions Tranche 2"
Cohesion: 0.17
Nodes (16): Exclusion de bypassPermissions du menu v1, ControlMenu (menu déroulant de contrôle à chaud), Test de couture (traversée bout en bout sans double de protocole), Résolution du conflit sur la touche Échap, Permission Bridge (court-circuit canUseTool), Permission Store (persistance par nom d'outil), Méthodes de contrôle SDK (setModel, setPermissionMode, applyFlagSettings, supportedModels), Exécuteur de workflow et barrières (+8 more)

### Community 8 - "TSConfig Client"
Cohesion: 0.13
Nodes (14): compilerOptions, allowImportingTsExtensions, jsx, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess (+6 more)

### Community 9 - "TSConfig Serveur"
Cohesion: 0.13
Nodes (14): compilerOptions, lib, module, moduleResolution, noUncheckedIndexedAccess, outDir, rewriteRelativeImportExtensions, rootDir (+6 more)

### Community 10 - "DevDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, jsdom, @testing-library/dom, @testing-library/react, @types/node, @types/react, @types/react-dom, @types/ws (+4 more)

### Community 11 - "Script Verify E2E"
Cohesion: 0.20
Nodes (5): ref_node_child_process, echecs, results, server, serverLog

### Community 13 - "Scripts NPM"
Cohesion: 0.22
Nodes (9): scripts, build, dev, dev:client, dev:server, test, test:client, typecheck (+1 more)

### Community 14 - "Plans Tranche 1"
Cohesion: 0.43
Nodes (8): Statut TEST_DEFECT, Tranche1.md — Cœur session, Feature 01 — Socle projet, Feature 02 — Protocole WebSocket, Feature 03 — Session manager, Feature 04 — Shell UI, Feature 05 — Conversation et streaming, Feature 06 — Interruption

### Community 15 - "Trois Lois de Mise en Page"
Cohesion: 0.40
Nodes (5): Three laws of the layout, Three laws of the layout (design-system), Reports et arbitrages (fonctionnalités écartées de la v1), Barrière optionnelle par étape (pas de barrière systématique), Principes de conception (trois règles)

### Community 16 - "Pattern Couture"
Cohesion: 0.67
Nodes (3): Feature de couture, Feature 07 — Couture (permission bout-en-bout), Contraintes globales tranche 3 (getContextUsage natif, git event-driven)

### Community 17 - "Architecture SDK"
Cohesion: 0.67
Nodes (3): Le gestionnaire de session (composant central), Pourquoi le SDK et pas le CLI, Protocole client-serveur (ServerEvent/ClientCommand)

### Community 18 - "Controle de Requete"
Cohesion: 0.67
Nodes (3): Query.setModel / setPermissionMode / applyFlagSettings, SessionManager.interrupt() (idempotent), Process / Prompts / Workflows restent distincts

## Ambiguous Edges - Review These
- `client/index.html — point d'entrée client` → `docs/architecture.md`  [AMBIGUOUS]
  client/index.html · relation: references

## Knowledge Gaps
- **142 isolated node(s):** `DECISION_LABEL`, `TONE_COLOR`, `root`, `demande`, `PLACEHOLDER_CONTROLS` (+137 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 181 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `client/index.html — point d'entrée client` and `docs/architecture.md`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `ws` connect `Client WebSocket` to `Script Verify E2E`, `Package Dependances`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `DevDependencies` to `Package Dependances`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `react` connect `Composants UI Conversation` to `Package Dependances`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **What connects `DECISION_LABEL`, `TONE_COLOR`, `root` to the rest of the system?**
  _142 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Composants UI Conversation` be split into smaller, more focused modules?**
  _Cohesion score 0.07088989441930618 - nodes in this community are weakly interconnected._
- **Should `Client WebSocket` be split into smaller, more focused modules?**
  _Cohesion score 0.09176788124156546 - nodes in this community are weakly interconnected._