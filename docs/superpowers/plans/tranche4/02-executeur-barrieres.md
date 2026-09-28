# Feature 02 — Exécuteur et barrières

Objectif : enchaînement des étapes, application des réglages par étape, suspension sur barrière.

Voir [Tranche4.md](../Tranche4.md) — contrainte : les changements de réglage entre étapes passent par `setModel()`, `setPermissionMode()`, `applyFlagSettings({effortLevel})` sur la session en cours, jamais par une nouvelle session. La barrière est optionnelle et décidée par étape, jamais systématique.

**Spec :** [../../specs/2026-09-16-claude-dashboard-v1-design.md](../../specs/2026-09-16-claude-dashboard-v1-design.md) — section 3.7.

**Files:** à préciser lors de l'écriture du plan détaillé, une fois la reconnaissance (feature 00) disponible.
