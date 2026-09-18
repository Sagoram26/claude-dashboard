/**
 * Rejoue le critère de fin d'une tranche contre le VRAI SDK.
 *
 * ⚠ CE SCRIPT CONSOMME DES CRÉDITS. Il est volontairement hors de `npm test`
 * pour qu'il ne tourne jamais par accident. Coût observé : ~0,20 $ par passage.
 *
 * Quand le lancer :
 *   - à mi-parcours de chaque tranche, dès que le serveur répond ;
 *   - avant la revue finale de branche.
 *
 * Pourquoi il existe : en tranche 1, une suite entièrement verte a masqué deux
 * défauts critiques — le streaming n'était jamais émis, et le message de
 * l'utilisateur n'atteignait jamais la conversation. Chaque feature était
 * conforme à sa propre spécification ; le défaut vivait entre elles. Ce script
 * les aurait trouvés en trente secondes.
 *
 * Usage : npm run verify:e2e
 * Sortie : code 0 si tous les critères passent, 1 sinon.
 */

import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

const PORT = 4318; // différent du port de développement, pour ne pas entrer en conflit
const SERVER_TIMEOUT_MS = 15_000;
const RUN_TIMEOUT_MS = 240_000;

const results = [];
function check(nom, ok, detail) {
  results.push({ nom, ok, detail });
  console.log(`  ${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ` — ${detail}` : ''}`);
}

async function waitForHealth(port) {
  const deadline = Date.now() + SERVER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return true;
    } catch {
      // le serveur n'écoute pas encore
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function runScenario(port) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const deltaIds = new Set();
    const completeIds = new Set();
    const errors = [];
    const statuses = [];
    const toolActivity = [];
    const permissionRequests = [];
    const permissionResolved = [];
    let userEcho = null;
    let interruptedText = null;
    let phase = 1;
    let totalUsd = 0;

    const send = (o) => ws.send(JSON.stringify(o));
    const snapshot = () => ({
      deltaIds, completeIds, errors, statuses, userEcho, interruptedText, totalUsd, toolActivity,
      permissionRequests, permissionResolved,
    });
    const done = () => {
      ws.close();
      resolve(snapshot());
    };

    ws.on('error', (err) => {
      errors.push(`connexion : ${err.message}`);
      resolve(snapshot());
    });

    ws.on('open', () => {
      console.log('\n[1/4] Premier message');
      send({ type: 'message.send', text: 'Retiens le nombre 47. Reponds juste: ok' });
    });

    ws.on('message', (raw) => {
      const e = JSON.parse(raw.toString());

      if (e.type === 'message.delta') deltaIds.add(e.messageId);
      if (e.type === 'error') errors.push(e.message);
      if (e.type === 'session.state') statuses.push(e.state.status);
      if (e.type === 'tool.activity') toolActivity.push(e.name);
      if (e.type === 'cost.usage') totalUsd = e.totalUsd;
      if (e.type === 'message.complete' && e.role === 'user') userEcho = e.text;

      if (e.type === 'permission.request') {
        permissionRequests.push(e.request);
        // Autorisé immédiatement : ce qu'on vérifie est que la demande arrive intacte et que la
        // réponse débloque l'agent, pas le délai de réflexion d'un humain.
        send({ type: 'permission.respond', requestId: e.request.requestId, decision: 'allow' });
      }
      if (e.type === 'permission.resolved') permissionResolved.push(e.requestId);

      if (e.type !== 'message.complete' || e.role !== 'assistant') return;

      completeIds.add(e.messageId);

      if (phase === 1) {
        phase = 2;
        console.log('[2/4] Le contexte traverse-t-il les tours ?');
        setTimeout(() => send({
          type: 'message.send',
          text: 'Quel nombre je t ai demande de retenir ? Reponds par le nombre seul.',
        }), 300);
        return;
      }

      if (phase === 2) {
        phase = 3;
        console.log('[3/4] Interruption d une génération longue');
        setTimeout(() => {
          send({ type: 'message.send', text: 'Compte lentement de 1 a 200, un nombre par ligne.' });
          setTimeout(() => send({ type: 'session.interrupt' }), 3500);
        }, 300);
        return;
      }

      if (phase === 3) {
        phase = 4;
        interruptedText = e.text;
        console.log('[4/5] La session survit-elle à l interruption ?');
        setTimeout(() => send({ type: 'message.send', text: 'Dis juste: toujours la' }), 500);
        return;
      }

      if (phase === 4) {
        phase = 5;
        console.log('[5/5] Une demande de permission traverse-t-elle ?');
        // Write et non Bash : le SDK classe `echo bonjour` comme sûr et n'appelle jamais
        // `canUseTool` pour lui. Une écriture de fichier déclenche une vraie demande. Constaté en
        // sondant le SDK, pas supposé — trois passages de vérification ont été dépensés à croire
        // que le pont était cassé alors que c'était le scénario qui visait le mauvais outil.
        setTimeout(
          () => send({ type: 'message.send', text: 'Utilise l outil Write pour creer le fichier dist/verif-e2e.txt contenant le mot ok' }),
          300,
        );
        return;
      }

      done();
    });

    setTimeout(() => {
      errors.push('délai global dépassé');
      done();
    }, RUN_TIMEOUT_MS);
  });
}

console.log('⚠ Ce script appelle le vrai SDK et consomme des crédits.\n');
console.log(`Démarrage du serveur sur le port ${PORT}…`);

/**
 * Environnement débarrassé du contexte Claude Code de l'appelant.
 *
 * Lancé depuis une session Claude Code, ce script hérite de `CLAUDECODE`,
 * `CLAUDE_CODE_CHILD_SESSION`, `CLAUDE_CODE_MESSAGING_SOCKET` et consorts. Le SDK traite alors le
 * serveur comme une session fille et fait arbitrer les permissions par la session parente : notre
 * `canUseTool` n'est jamais appelé, et la vérification passe au vert en ayant testé le mauvais
 * chemin.
 *
 * C'est exactement le contraire de ce qu'on cherche. L'utilisateur lancera `npm run dev:server`
 * depuis un terminal ordinaire ; c'est cet environnement-là qu'il faut reproduire.
 */
function environnementPropre() {
  const env = {};
  for (const [cle, valeur] of Object.entries(process.env)) {
    if (cle === 'CLAUDECODE' || cle === 'AI_AGENT') continue;
    if (cle.startsWith('CLAUDE_CODE_') || cle.startsWith('CLAUDE_')) continue;
    env[cle] = valeur;
  }
  env.PORT = String(PORT);
  return env;
}

const server = spawn(
  process.execPath,
  ['--experimental-strip-types', 'server/index.ts'],
  { env: environnementPropre(), stdio: ['ignore', 'pipe', 'pipe'] },
);

const serverLog = [];
server.stdout.on('data', (d) => serverLog.push(d.toString()));
server.stderr.on('data', (d) => serverLog.push(d.toString()));

if (!(await waitForHealth(PORT))) {
  console.error(`Le serveur n'a pas répondu sur /health en ${SERVER_TIMEOUT_MS / 1000} s.`);
  console.error(serverLog.join(''));
  server.kill();
  process.exit(1);
}

const r = await runScenario(PORT);
server.kill();

console.log('\n=== CRITÈRE DE FIN ===');

check('le message de l utilisateur revient dans la conversation', r.userEcho !== null, r.userEcho ?? 'aucun écho');

check('le streaming émet des deltas', r.deltaIds.size > 0, `${r.deltaIds.size} identifiants de deltas`);

const idsPartages = r.deltaIds.size > 0 && [...r.deltaIds].every((id) => r.completeIds.has(id));
check(
  'deltas et complete partagent leur identifiant',
  idsPartages,
  idsPartages ? 'pas de double affichage' : 'le texte s afficherait deux fois',
);

check('le contexte traverse les tours', r.completeIds.size >= 2, `${r.completeIds.size} réponses`);

const interrompu = r.interruptedText !== null && !r.interruptedText.includes('200');
check(
  'la génération longue a bien été interrompue',
  interrompu,
  r.interruptedText ? `arrêtée après ${r.interruptedText.split('\n').length} lignes sur 200` : 'aucune réponse',
);

check('la session survit à l interruption', r.completeIds.size >= 4, `${r.completeIds.size} réponses au total`);

check(
  'une demande de permission atteint le client',
  r.permissionRequests.length > 0,
  `${r.permissionRequests.length} demande(s)`,
);

const champsComplets =
  r.permissionRequests.length > 0 &&
  r.permissionRequests.every((p) => p.requestId && p.toolUseId && p.toolName);
check(
  'la demande porte requestId, toolUseId et toolName',
  champsComplets,
  champsComplets ? 'les trois champs sont remplis' : 'un champ a change de nom en route',
);

check(
  'la reponse debloque la demande',
  r.permissionRequests.length > 0 && r.permissionResolved.length === r.permissionRequests.length,
  `${r.permissionResolved.length} resolues sur ${r.permissionRequests.length}`,
);

check('aucune erreur', r.errors.length === 0, r.errors.join(' | ') || 'aucune');

console.log(`\nStatuts traversés : ${[...new Set(r.statuses)].join(' → ')}`);
console.log(`Outils appelés : ${[...new Set(r.toolActivity)].join(', ') || 'aucun'}`);
console.log(`Coût de cette vérification : $${r.totalUsd.toFixed(4)}`);

const echecs = results.filter((x) => !x.ok);
if (echecs.length > 0) {
  console.error(`\n${echecs.length} critère(s) en échec.`);
  process.exit(1);
}
console.log('\nTous les critères passent.');
process.exit(0);
