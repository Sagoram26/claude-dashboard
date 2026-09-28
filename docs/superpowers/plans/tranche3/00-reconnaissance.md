# Feature 00 — Reconnaissance d'environnement

**Précède toute écriture de code de la tranche.**

Produit `docs/environnement.md` (section tranche 3), avec les signatures **extraites de `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`**, copiées telles quelles, pour tout ce que la tranche 3 appelle :

- `Query.getContextUsage({detail})` et le type `SDKContextUsage` (`total_tokens`, `raw_max_tokens`, `percentage`, `over_limit?`, `categories[]`, `mcp_tools[]`, `memory_files[]`, `agents[]`, `skills[]`)
- `Query.supportedModels()`, `Query.supportedAgents()`, `Query.supportedCommands()`, `Query.mcpServerStatus()`
- Tout écart constaté entre ces signatures et ce que la spécification v1 suppose (le repli « total seul » mentionné par le spec est déjà connu comme caduc — le confirmer).

Les features 01 à 07 citent ce fichier. Elles n'inventent aucune signature.

**Files:**
- Modify: `docs/environnement.md`
