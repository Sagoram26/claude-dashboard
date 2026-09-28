import type { ContextUsage } from '../../../server/protocol.ts';

export type ContextPopoverProps = {
  open: boolean;
  usage: ContextUsage | null;
  onCompact: () => void;
  onClose: () => void;
};

export function ContextPopover({ open, usage, onCompact, onClose }: ContextPopoverProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Contexte"
      style={{
        position: 'absolute',
        right: 10,
        bottom: 'calc(var(--footer-h) + 8px)',
        width: 260,
        background: 'var(--surface-raised)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        padding: 10,
        fontSize: 12,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>Contexte</strong>
        <button type="button" className="pill" onClick={onClose}>
          Fermer
        </button>
      </div>
      {usage ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {usage.categories.map((c) => (
            <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{c.name}</span>
              <span className="mono">{c.tokens}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: 'var(--text-faint)' }}>Chargement…</div>
      )}
      <button type="button" className="pill" style={{ marginTop: 10, width: '100%' }} onClick={onCompact}>
        Compacter
      </button>
    </div>
  );
}
