import type { ThreadEntry } from '../state.ts';
import { ApprovalBlock } from './ApprovalBlock.tsx';

export function Conversation({
  thread,
  error,
  onDecide,
  onWorkflowGateAction,
}: {
  thread: ThreadEntry[];
  error: string | null;
  onDecide: (requestId: string, decision: 'allow' | 'always' | 'deny', reason?: string) => void;
  onWorkflowGateAction: (checkpointId: string, action: 'continue' | 'correct') => void;
}) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '16px 0',
      }}
    >
      {error !== null && (
        <div
          role="alert"
          style={{
            fontSize: 12,
            color: 'var(--danger)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius-control)',
            padding: '6px 8px',
          }}
        >
          {error}
        </div>
      )}
      {thread.map((entry) => {
        if (entry.kind === 'approval') {
          return (
            <ApprovalBlock
              key={entry.id}
              entry={entry}
              onDecide={(decision, reason) => onDecide(entry.id, decision, reason)}
            />
          );
        }

        if (entry.kind === 'checkpoint') {
          const { checkpoint } = entry;
          if (checkpoint.status === 'gate') {
            return (
              <div
                key={entry.id}
                style={{
                  fontSize: 13,
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-control)',
                  padding: 12,
                }}
              >
                <div style={{ marginBottom: 8 }}>{checkpoint.label} — barrière</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="pill"
                    onClick={() => onWorkflowGateAction(checkpoint.id, 'continue')}
                  >
                    Continuer
                  </button>
                  <button
                    type="button"
                    className="pill"
                    onClick={() => onWorkflowGateAction(checkpoint.id, 'correct')}
                  >
                    Corriger
                  </button>
                </div>
              </div>
            );
          }

          const durationLabel =
            checkpoint.status === 'done' && checkpoint.durationMs !== undefined
              ? ` (${Math.round(checkpoint.durationMs / 1000)}s)`
              : '';
          return (
            <div key={entry.id} style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {checkpoint.status === 'running' ? '▸' : '✓'} {checkpoint.label}
              {durationLabel}
            </div>
          );
        }

        return (
          <article
            key={entry.id}
            data-role={entry.role}
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: entry.role === 'user' ? 'var(--text-muted)' : 'var(--text)',
              whiteSpace: 'pre-wrap',
            }}
          >
            {entry.text}
          </article>
        );
      })}
    </div>
  );
}
