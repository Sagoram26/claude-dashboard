# Feature 00 — Reconnaissance d'environnement

**Précède toute écriture de code de la tranche.**

Produit `docs/environnement.md` (section tranche 4), avec les signatures **extraites de `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`**, copiées telles quelles, pour tout ce que la tranche 4 appelle :

- Les méthodes de contrôle utilisées entre les étapes d'un workflow : `Query.setModel`, `Query.setPermissionMode`, `Query.applyFlagSettings({effortLevel})`
- La forme exacte de `SDKControlInterruptResponse` (l'accusé de réception devient utile ici)
- Tout écart constaté entre ces signatures et ce que la spécification v1 suppose.

Les features 01 à 06 citent ce fichier. Elles n'inventent aucune signature.

**Files:**
- Modify: `docs/environnement.md`
