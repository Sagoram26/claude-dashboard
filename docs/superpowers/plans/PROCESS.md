# Procédé de développement

Ce document décrit le cycle utilisé pour exécuter les plans de ce projet. Il
existe pour que les consignes envoyées aux agents y renvoient au lieu de le
réciter à chaque fois, et pour que les leçons de la tranche 1 ne soient pas
réapprises à la tranche 3.

## Le cycle

Chaque feature passe par trois agents successifs, jamais le même.

**ROUGE — écrit les tests.** Reçoit le fichier de feature comme spécification.
Écrit les fichiers de test, les exécute, et vérifie qu'ils échouent **pour la
bonne raison** : un module de production absent ou une fonction non définie, pas
une faute de frappe, un import cassé sans rapport ou une configuration de test
défaillante. Commit des tests seuls, en échec.

Interdiction absolue d'écrire une ligne de code de production.

**VERT — implémente.** Reçoit le fichier de feature et les tests déjà écrits.
Écrit le minimum pour les faire passer.

Interdiction de modifier un test. S'il en juge un faux, il s'arrête et le déclare
— voir `TEST_DEFECT` ci-dessous.

**REVUE — vérifie.** Reçoit le diff complet de la feature, le fichier de feature
et les rapports des deux précédents. Rend deux verdicts distincts : conformité à
la spécification, et qualité.

## Pourquoi commiter des tests rouges

Cela rend la phase rouge vérifiable dans l'historique git plutôt que déclarative.
On peut relire la branche et voir l'alternance ; un `git log` suffit à savoir si
le TDD a été tenu ou raconté.

## Statuts de sortie

Un agent termine sur l'un de ces statuts :

| Statut | Sens |
|---|---|
| `DONE` | Terminé, rien à signaler |
| `DONE_WITH_CONCERNS` | Terminé, mais avec un écart ou un doute à examiner |
| `NEEDS_CONTEXT` | Il manque une information que la consigne ne donnait pas |
| `BLOCKED` | Impossible d'avancer |
| `TEST_DEFECT` | **Le test est faux, pas le code** |

### `TEST_DEFECT`

Réservé à l'agent VERT. Quand un test lui paraît faux, incohérent avec la
spécification, ou impossible à satisfaire par une implémentation correcte, il
s'arrête et le déclare, avec le fichier, la ligne, et pourquoi.

**Il ne contourne pas dans le code de production.** C'est le point précis que ce
statut existe pour empêcher.

En tranche 1, l'absence de cette échappatoire a produit deux contournements :

- `WebSocket.OPEN` remplacé par le littéral `1`, parce que le double de test ne
  déclarait pas la constante statique.
- `flushSync` ajouté sur le chemin de réception de chaque message WebSocket,
  parce qu'un test appelait un listener hors `act` puis lisait le DOM sans
  attendre. Il a fallu un tour de correction complet pour le retirer, et le
  correctif était dans le test depuis le début.

Sur `TEST_DEFECT`, le contrôleur tranche : soit il lève l'interdiction pour ce
point précis et uniquement celui-là, soit il corrige la spécification. Les deux
sont moins chers qu'un contournement.

## Ce qu'il ne faut pas casser

Trois comportements ont bien fonctionné en tranche 1 et méritent d'être
protégés explicitement dans les consignes.

**Dire ce qu'on n'a pas pu vérifier.** Aucun agent n'a de navigateur ; aucun n'a
prétendu avoir fait la vérification visuelle. Deux ont signalé spontanément qu'un
test était vacuement vrai — vert parce que la fonctionnalité n'existait nulle
part, pas parce qu'elle marchait. Les consignes doivent continuer d'autoriser
explicitement « je n'ai pas pu », sinon elles encouragent à broder.

**Ne pas gonfler la sévérité.** Sur le `flushSync`, le relecteur a démontré que
le coût actuel était nul tout en expliquant pourquoi corriger quand même. Une
revue qui exagère devient du bruit qu'on apprend à ignorer. Un rapport vide est
un résultat valable : les consignes de revue doivent le dire.

**Ne pas inventer de constat pour justifier sa présence.** Corollaire du
précédent, à écrire dans chaque consigne de revue.

## Les doubles de test sont un livrable

Les doubles partagés — faux `WebSocket`, faux `query` — vivent dans un fichier
dédié, et sont produits par la première feature qui en a besoin.

Sinon chaque feature en recopie une variante : la tranche 1 s'est terminée avec
six `FakeWebSocket` légèrement divergents, qu'aucune revue ne pouvait voir
puisque chacune n'en ajoutait qu'une copie.

## Les limites connues du cycle

À garder en tête, parce qu'elles sont structurelles et non corrigibles par une
meilleure consigne :

**La couverture en silo.** Chaque agent teste sa feature contre des doubles.
Personne n'a mandat pour tester la couture entre deux features. C'est ce qui a
laissé passer les deux défauts critiques de la tranche 1 : chaque feature était
parfaitement conforme à sa propre spécification, et le défaut vivait entre elles.

La parade est la feature de couture en fin de tranche, décrite dans
[CLAUDE.md](../../../CLAUDE.md).

**Une suite verte ne prouve pas que l'application marche.** Elle prouve la
cohérence de chaque morceau avec lui-même. Seule l'exécution du critère de fin
contre le vrai SDK le prouve — `npm run verify:e2e`, à lancer **à mi-parcours**
de la tranche et pas seulement à la fin. En tranche 1, l'exécuter après la
feature 03 aurait montré qu'aucun `message.delta` ne sortait, avant que trois
features de client soient construites par-dessus.

## Choix des modèles

| Rôle | Modèle | Raison |
|---|---|---|
| ROUGE et VERT | Sonnet | Le code figure dans le fichier de feature ; c'est de la transcription et de la vérification |
| REVUE de feature | Sonnet | Diffs petits et mécaniques |
| REVUE finale de branche | Le plus capable | Vue d'ensemble, jugement architectural, tri des mineurs reportés |
| Correction aux tours 4 et 5 | Un cran au-dessus de l'implémenteur | Une boucle qui survit à trois tentatives signale que l'agent ne voit pas son propre problème |

Toujours nommer le modèle explicitement au dispatch : l'omettre fait hériter du
modèle de la session, souvent le plus cher.

## Le registre

Un fichier `progress.md` par plan, ignoré par git, tient la trace de chaque
feature terminée, de chaque tour de correction et de **chaque arbitrage pris à la
place de l'utilisateur**, avec ce que chacun coûte s'il est mauvais.

Il survit à une compaction du contexte, ce que la mémoire de session ne garantit
pas. À la fin, tous les arbitrages sont restitués à l'utilisateur : une décision
prise en son nom et jamais rapportée est une décision prise en secret.
