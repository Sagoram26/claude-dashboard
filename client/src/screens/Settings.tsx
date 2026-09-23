import { useEffect } from 'react';
import type { GrantedPermission } from '../../../server/protocol.ts';

const A_VENIR: [string, string][] = [
  ['Serveurs MCP', 'tranche 3'],
  ['Hooks', 'tranche 3'],
  ['Prompts', 'tranche 4'],
  ['Workflows', 'tranche 4'],
  ['Process', 'tranche 4'],
];

export function Settings({
  granted,
  onRevoke,
  onClose,
}: {
  granted: GrantedPermission[];
  onRevoke: (toolName: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 'var(--conversation-max)', padding: '24px 0' }}>
        <header style={{ display: 'flex', alignItems: 'baseline', marginBottom: 20 }}>
          <h1 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>Réglages</h1>
          <button type="button" className="pill" style={{ marginLeft: 'auto' }} onClick={onClose}>
            Fermer <span style={{ color: 'var(--text-faint)' }}>esc</span>
          </button>
        </header>

        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 13, fontWeight: 500, margin: '0 0 4px' }}>Permissions accordées</h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 10px' }}>
            Les outils pour lesquels vous avez choisi « Toujours ». Ils ne demandent plus.
          </p>

          {granted.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>
              Aucune permission accordée.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {granted.map((permission) => (
                <li
                  key={permission.toolName}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 0',
                    borderTop: '1px solid var(--border)',
                    fontSize: 12,
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{permission.toolName}</span>
                  <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>
                    {new Date(permission.grantedAt).toLocaleString('fr-FR')}
                  </span>
                  <button
                    type="button"
                    className="pill"
                    data-tone="warn"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => onRevoke(permission.toolName)}
                  >
                    Révoquer {permission.toolName}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {A_VENIR.map(([titre, tranche]) => (
          <section key={titre} style={{ marginBottom: 14, opacity: 0.55 }}>
            <h2 style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>
              {titre} <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>— à venir, {tranche}</span>
            </h2>
          </section>
        ))}
      </div>
    </div>
  );
}
