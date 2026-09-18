import { useState } from 'react';
import type { ApprovalEntry } from '../state.ts';

const DECISION_LABEL: Record<NonNullable<ApprovalEntry['decision']>, string> = {
  allow: 'Autorisé',
  always: 'Autorisé, et toujours pour cet outil',
  deny: 'Refusé',
};

/** Le contenu exact soumis à approbation, selon l'outil. Jamais une reformulation. */
function Body({ toolName, input }: { toolName: string; input: Record<string, unknown> }) {
  const mono = {
    // `fontFamily` et non le raccourci `font` : ce dernier exige une taille, et `font: <famille>`
    // seul est invalide — la déclaration entière est ignorée et le corps retombe sur la police
    // d'interface. Invisible en jsdom, visible seulement dans un vrai navigateur.
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    whiteSpace: 'pre-wrap' as const,
    margin: 0,
  };

  if (toolName === 'Edit' || toolName === 'Write') {
    const path = typeof input.file_path === 'string' ? input.file_path : '';
    const before = typeof input.old_string === 'string' ? input.old_string : '';
    const after = typeof input.new_string === 'string' ? input.new_string : String(input.content ?? '');
    return (
      <div>
        <div style={{ ...mono, color: 'var(--text-muted)', marginBottom: 6 }}>{path}</div>
        {before !== '' && <pre style={{ ...mono, color: 'var(--danger)' }}>{`- ${before}`}</pre>}
        <pre style={{ ...mono, color: 'var(--ok, var(--accent))' }}>{`+ ${after}`}</pre>
      </div>
    );
  }

  const single = ['command', 'file_path', 'path', 'pattern']
    .map((key) => input[key])
    .find((value) => typeof value === 'string');

  return <pre style={mono}>{typeof single === 'string' ? single : JSON.stringify(input, null, 2)}</pre>;
}

export function ApprovalBlock({
  entry,
  onDecide,
}: {
  entry: ApprovalEntry;
  onDecide: (decision: 'allow' | 'always' | 'deny', reason?: string) => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const { request, decision } = entry;
  const settled = decision !== null;

  return (
    <section
      data-approval={request.requestId}
      style={{
        // docs/design-system.md : « Approval block — 1px `--warn` border, `--warn-soft` fill »,
        // et « 5px on controls and blocks ». La couleur est sémantique : `--warn` veut dire
        // « approbation en attente ». Une demande tranchée n'attend plus, donc elle redevient
        // neutre — sinon le fil finirait entièrement orange sur une longue session.
        border: `1px solid ${settled ? 'var(--border)' : 'var(--warn)'}`,
        borderRadius: 'var(--radius-control)',
        padding: 12,
        background: settled ? 'var(--surface-raised)' : 'var(--warn-soft)',
        opacity: settled ? 0.7 : 1,
      }}
    >
      <header style={{ fontSize: 13, marginBottom: 8, color: 'var(--text)' }}>
        {request.title ??
          // Pour Edit/Write, le chemin est déjà affiché dans le corps : ne pas le répéter ici,
          // sinon deux éléments du DOM portent le même texte pour un même test de recherche.
          (request.toolName === 'Edit' || request.toolName === 'Write'
            ? request.toolName
            : `${request.toolName}${describeTarget(request.input)}`)}
      </header>

      {request.mcpServer && (
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 8 }}>
          serveur MCP : {request.mcpServer.name}
        </div>
      )}

      <Body toolName={request.toolName} input={request.input} />

      {settled ? (
        <footer style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          {DECISION_LABEL[decision]}
        </footer>
      ) : reason === null ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button type="button" className="pill" onClick={() => onDecide('allow')}>
            Autoriser
            {!request.defaultToNo && (
              <span data-shortcut style={{ color: 'var(--text-faint)' }}>a</span>
            )}
          </button>
          {request.canAlwaysAllow && (
            <button type="button" className="pill" onClick={() => onDecide('always')}>
              Toujours pour cet outil
            </button>
          )}
          <button type="button" className="pill" data-tone="warn" onClick={() => setReason('')}>
            Refuser
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input
            aria-label="Raison du refus"
            value={reason}
            autoFocus
            onChange={(e) => setReason(e.target.value)}
            style={{
              flex: 1,
              background: 'var(--surface)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-control)',
              padding: '4px 8px',
              font: 'inherit',
              fontSize: 12,
            }}
          />
          <button type="button" className="pill" onClick={() => onDecide('deny', reason)}>
            Envoyer le refus
          </button>
        </div>
      )}
    </section>
  );
}

function describeTarget(input: Record<string, unknown>): string {
  for (const key of ['file_path', 'path', 'command', 'pattern']) {
    const value = input[key];
    if (typeof value === 'string') return ` ${value}`;
  }
  return '';
}
