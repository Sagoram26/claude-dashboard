import type { ApprovalEntry } from '../state.ts';

export function PendingApprovalBar({
  pending,
  onAllow,
  onReveal,
}: {
  pending: ApprovalEntry[];
  onAllow: (requestId: string) => void;
  onReveal: (requestId: string) => void;
}) {
  const first = pending[0];
  if (!first) return null;

  const label =
    pending.length === 1
      ? `${first.request.displayName ?? first.request.toolName} attend votre décision`
      : `${pending.length} demandes attendent votre décision`;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        marginBottom: 8,
        fontSize: 12,
        color: 'var(--text)',
        background: 'var(--warn-soft)',
        border: '1px solid var(--warn)',
        borderRadius: 'var(--radius-control)',
      }}
    >
      <span>{label}</span>
      <button
        type="button"
        className="pill"
        style={{ marginLeft: 'auto' }}
        onClick={() => onReveal(first.id)}
      >
        Voir la demande
      </button>
      <button type="button" className="pill" onClick={() => onAllow(first.id)}>
        Autoriser
      </button>
    </div>
  );
}
