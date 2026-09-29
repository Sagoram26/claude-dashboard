import type { ClientCommand, ServerEvent, WorkflowCheckpoint, WorkflowDefinition, PromptDefinition } from '../protocol.ts';
import { listWorkflows, loadWorkflow, saveWorkflow, deleteWorkflow } from './store.ts';
import { listPrompts, savePrompt, deletePrompt } from '../prompts/store.ts';
import { createWorkflowExecutor } from './executor.ts';

/**
 * I1 (revue finale de branche tranche 4) : ce module porte le cablage des commandes workflow.* et
 * prompt.* qui vivait auparavant enferme dans le bloc `if (isEntrypoint)` de `server/index.ts`, recopie a la
 * main dans `server/couture.test.ts`. En le sortant ici (sans dependre du SDK, seulement de
 * `./store.ts`, `../prompts/store.ts` et `./executor.ts`, tous les trois bon marche a importer),
 * le meme code tourne en production ET dans le test de couture — plus de copie a faire diverger.
 */

/** Sous-ensemble de `SessionManager` reellement consomme ici : pas de dependance au SDK. */
export type WiringManager = {
  state: () => { status: string };
  applyRuntime: (r: { model?: string; effort?: string; permissionMode?: string }) => Promise<void>;
  send: (text: string) => void;
};

/**
 * Enveloppe `emit` pour construire `waitForTurnEnd()` sans toucher à la signature publique de
 * `SessionManager` : broadcast l'événement normalement, et résout les attentes en cours quand le
 * statut repasse à `'idle'`. Motif classique (liste de résolveurs vidée à chaque passage).
 *
 * Chaque attente est taguée par un jeton `owner` propre à l'exécuteur qui l'a enregistrée. Au
 * passage à `'idle'`, seuls les résolveurs dont le jeton correspond encore au propriétaire courant
 * (`getActiveOwner()`) sont débloqués. Ce filtrage reste utile en garde générale même si B3
 * (ci-dessous, dans `createWorkflowController`) rend l'entrelacement entre deux WORKFLOWS
 * structurellement impossible : un message utilisateur tapé pendant une étape de workflow (hors
 * périmètre de la garde `workflow.start`) peut encore produire un `emit('idle')` qui ne correspond
 * pas au tour de l'étape — documenté comme limite connue dans le rapport final.
 */
export function creerAttenteDeTour(broadcast: (e: ServerEvent) => void, getActiveOwner: () => unknown) {
  let waiters: Array<{ resolve: () => void; owner: unknown }> = [];
  const emit = (event: ServerEvent) => {
    broadcast(event);
    if (event.type === 'session.state' && event.state.status === 'idle') {
      const toWake = waiters;
      waiters = [];
      const active = getActiveOwner();
      for (const w of toWake) {
        if (w.owner === active) w.resolve();
      }
    }
  };
  const waitForTurnEndFor = (owner: unknown) => () =>
    new Promise<void>((resolve) => waiters.push({ resolve, owner }));
  return { emit, waitForTurnEndFor };
}

export type WorkflowControllerDeps = {
  workflowsDir: string;
  promptsDir: string;
  getManager: () => WiringManager | null;
  broadcast: (e: ServerEvent) => void;
  waitForTurnEndFor: (owner: unknown) => () => Promise<void>;
};

export function createWorkflowController(deps: WorkflowControllerDeps) {
  let workflows: WorkflowDefinition[] = [];
  let prompts: PromptDefinition[] = [];
  let activeExecutor: ReturnType<typeof createWorkflowExecutor> | null = null;
  let activeOwner: object | null = null;
  /** Dernier checkpoint 'gate' encore actif (I6) : rejoue a la reconnexion, comme pendingPermissions(). */
  let pendingGate: WorkflowCheckpoint | null = null;

  function broadcastError(err: unknown): void {
    deps.broadcast({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }

  async function refreshWorkflows(): Promise<void> {
    workflows = await listWorkflows(deps.workflowsDir);
    deps.broadcast({ type: 'workflows.list', workflows });
  }

  async function refreshPrompts(): Promise<void> {
    prompts = await listPrompts(deps.promptsDir);
    deps.broadcast({ type: 'prompts.list', prompts });
  }

  async function loadInitialLists(): Promise<void> {
    workflows = await listWorkflows(deps.workflowsDir);
    prompts = await listPrompts(deps.promptsDir);
  }

  /** I7(b) : chaque chaine de promesse issue d'une commande garde son .catch, jamais laissee nue. */
  function run(executor: ReturnType<typeof createWorkflowExecutor>, p: Promise<void>): void {
    void p
      .then(() => {
        if (executor !== activeExecutor) return; // deja remplace par un workflow suivant
        if (executor.state()?.status === 'done') {
          activeExecutor = null;
          activeOwner = null;
          pendingGate = null;
        }
      })
      .catch(broadcastError);
  }

  function startWorkflow(workflow: WorkflowDefinition): void {
    const manager = deps.getManager();
    if (!manager) return;
    const owner = {};
    const executor = createWorkflowExecutor({
      applyRuntime: manager.applyRuntime,
      send: manager.send,
      waitForTurnEnd: deps.waitForTurnEndFor(owner),
      emitCheckpoint: (checkpoint) => {
        if (activeOwner !== owner) return;
        if (checkpoint.status === 'gate') pendingGate = checkpoint;
        deps.broadcast({ type: 'workflow.checkpoint', checkpoint });
      },
    });
    activeExecutor = executor;
    activeOwner = owner;
    pendingGate = null;
    run(executor, executor.start(workflow));
  }

  function onCommand(cmd: ClientCommand): void {
    switch (cmd.type) {
      case 'workflow.save':
        void saveWorkflow(deps.workflowsDir, cmd.workflow).then(refreshWorkflows).catch(broadcastError);
        return;
      case 'workflow.delete':
        void deleteWorkflow(deps.workflowsDir, cmd.id).then(refreshWorkflows).catch(broadcastError);
        return;
      case 'prompt.save':
        void savePrompt(deps.promptsDir, cmd.prompt).then(refreshPrompts).catch(broadcastError);
        return;
      case 'prompt.delete':
        void deletePrompt(deps.promptsDir, cmd.id).then(refreshPrompts).catch(broadcastError);
        return;
      case 'workflow.start': {
        const manager = deps.getManager();
        if (!manager) return;
        // B3 : refuse de demarrer un nouveau workflow si un tour est deja en cours OU si un
        // workflow est deja actif (y compris suspendu a une barriere), plutot que de laisser
        // `waitForTurnEnd` se debloquer sur le tour du mauvais evenement. Un seul workflow actif a
        // la fois, explicitement signale au client, jamais un remplacement silencieux.
        if (manager.state().status !== 'idle' || activeExecutor !== null) {
          deps.broadcast({
            type: 'error',
            message:
              'Un workflow est deja en cours : attendez sa fin ou repondez a sa barriere avant d en demarrer un autre.',
          });
          return;
        }
        void loadWorkflow(deps.workflowsDir, cmd.workflowId)
          .then((workflow) => {
            if (!workflow) {
              deps.broadcast({ type: 'error', message: `Workflow introuvable : ${cmd.workflowId}` });
              return;
            }
            // I7(a) : un fichier .json edite a la main peut ne pas avoir de `steps` (ou un tableau
            // vide) ; rien dans le format ne l'interdit. Valide avant de demarrer l'executeur, qui
            // levait sinon au premier accès a `steps[0]`.
            if (!Array.isArray(workflow.steps) || workflow.steps.length === 0) {
              deps.broadcast({ type: 'error', message: `Workflow invalide (aucune etape) : ${cmd.workflowId}` });
              return;
            }
            startWorkflow(workflow);
          })
          .catch(broadcastError);
        return;
      }
      case 'workflow.resume': {
        // B2, corollaire : le checkpointId recu doit correspondre a la barriere COURANTE de
        // l'executeur actif, sinon n'importe quel vieux bouton "Continuer" reste affiche dans le
        // fil (barriere deja franchie, ou d'une session precedente) agirait sur la barriere
        // courante.
        if (!pendingGate || pendingGate.id !== cmd.checkpointId) return;
        const executor = activeExecutor;
        if (!executor) return;
        if (cmd.action === 'continue') {
          pendingGate = null;
          run(executor, executor.continueAfterGate());
        }
        if (cmd.action === 'correct') {
          executor.correctAtGate();
        }
        return;
      }
      default:
        return;
    }
  }

  function onConnect(send: (e: ServerEvent) => void): void {
    send({ type: 'workflows.list', workflows });
    send({ type: 'prompts.list', prompts });
    // I6 : rejoue la barriere en attente a la connexion, comme pendingPermissions() le fait deja
    // pour les permissions. Sans quoi un F5 pendant une barriere faisait disparaitre les boutons
    // Continuer/Corriger du fil cote client, alors que le workflow restait suspendu indefiniment
    // cote serveur (activeExecutor bloque a 'gated', plus personne ne pouvait l'en faire sortir).
    if (pendingGate) send({ type: 'workflow.checkpoint', checkpoint: pendingGate });
  }

  return {
    loadInitialLists,
    onCommand,
    onConnect,
    getActiveOwner: () => activeOwner,
  };
}
