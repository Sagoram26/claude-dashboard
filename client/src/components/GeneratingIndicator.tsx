export function GeneratingIndicator({ onInterrupt }: { onInterrupt: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 0',
        fontSize: 11,
        color: 'var(--text-muted)',
      }}
    >
      <span className="generating-dot" aria-hidden="true" />
      <span>Génération en cours…</span>
      <button type="button" className="pill" onClick={onInterrupt} style={{ marginLeft: 'auto' }}>
        Interrompre <span style={{ color: 'var(--text-faint)' }}>esc</span>
      </button>
    </div>
  );
}
