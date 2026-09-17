# Claude Dashboard — conventions du projet

## Ce que c'est

Une interface web locale pour Claude Code, bâtie sur `@anthropic-ai/claude-agent-sdk`.
Le projet ne réimplémente pas d'agent : il héberge le harnais et lui construit
l'interface qui manque. Voir [README.md](README.md) et
[docs/superpowers/specs/](docs/superpowers/specs/).

## Contraintes qui ne se négocient pas

**Dépendances de production : `@anthropic-ai/claude-agent-sdk`, `ws`, `react`,
`react-dom`. Aucune autre sans justification écrite.** Pas de framework serveur,
pas de bibliothèque d'état, pas de librairie de composants, pas de bibliothèque
de style. Si quelques lignes suffisent, écrire les quelques lignes.

**Node 22.6 ou supérieur** — `--experimental-strip-types` et le glob récursif de
`node --test` l'exigent. Déclaré dans `engines`.

**`server/protocol.ts` est le contrat unique** partagé serveur et client. Les deux
l'importent. Ajouter un type d'événement sans le traiter doit casser la
compilation, des deux côtés — c'est délibéré et vérifié.

**Aucune valeur de couleur, de taille ou d'espacement en dur.** Tout vient des
tokens de `client/src/tokens.css`, eux-mêmes issus de
[docs/design-system.md](docs/design-system.md).

## Les trois lois de mise en page

Elles tranchent tout arbitrage d'interface, et des tests les verrouillent.

1. **La conversation est souveraine.** Seuls y vivent le texte d'agent, les
   messages utilisateur, les checkpoints de workflow et les demandes
   d'approbation. **Jamais un appel d'outil** — ils sont réduits à des lignes
   dans la section Activité, repliée par défaut.
2. **Le haut sert à agir, le bas sert à savoir.** La barre supérieure ne contient
   que du cliquable ; le pied de page ne contient que de l'état, jamais une
   commande. Un test vérifie qu'aucun `<button>` n'existe dans le pied.
3. **Rien n'est visible en permanence sans l'avoir mérité.** Tout panneau
   secondaire est replié par défaut.

## Structure d'une tranche

Chaque tranche de travail produit un logiciel qui tourne et se teste seul, sur sa
propre branche (`tranche-N`). Le découpage en features est décrit dans
[docs/superpowers/plans/](docs/superpowers/plans/).

**Toute tranche commence par une feature de reconnaissance** qui relève les
versions installées et extrait les signatures réelles des `.d.ts` de tout ce que
la tranche va appeler. Résultat dans `docs/environnement.md`. Les features
suivantes citent ce fichier ; elles n'inventent pas de signature.

**Toute tranche se termine par une feature de couture**, dont le mandat explicite
est de tester ce qu'aucune feature ne teste : un événement réellement produit par
un bout du système traverse jusqu'à l'autre bout, sans double de protocole entre
les deux. Sans elle, chaque feature reste conforme à sa propre spécification
pendant que le défaut vit entre elles — c'est exactement ce qui a laissé passer
deux défauts critiques en tranche 1.

Le procédé de développement, les rôles et les statuts de sortie sont dans
[docs/superpowers/plans/PROCESS.md](docs/superpowers/plans/PROCESS.md).

## Vérification

- `npm test` — tests serveur (`node:test`). Aucun appel réseau, aucun crédit.
- `npm run test:client` — tests client (Vitest). Idem.
- `npm run typecheck`, `npm run build`.
- `npm run verify:e2e` — **rejoue le critère de fin contre le vrai SDK et consomme
  des crédits.** Volontairement hors de `npm test`. À lancer à mi-parcours de
  chaque tranche et avant la revue finale, jamais par accident.

Une suite verte prouve la cohérence de chaque morceau avec lui-même. Elle ne
prouve pas que l'application marche. Seul `verify:e2e` le prouve.
