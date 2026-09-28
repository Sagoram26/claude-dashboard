# Feature 07 — Couture

**Mandat explicite : tester ce qu'aucune autre feature ne teste.**

Fait traverser un agrégat d'état réellement produit par le serveur jusqu'à son rendu dans le pied de page, **sans double de protocole entre les deux bouts**.

Voir [Tranche3.md](../Tranche3.md) — critère de fin, points 1 à 7.

`npm run verify:e2e` se lance à mi-parcours de la tranche (dès une feature centrale terminée), pas seulement à la fin.

**Files:** `scripts/verify-e2e.mjs` — extension au fur et à mesure de la tranche.
