import type { ThreadEntry } from '../state.ts';
import { ApprovalBlock } from './ApprovalBlock.tsx';

export function Conversation({
  thread,
  error,
  onDecide,
}: {
  thread: ThreadEntry[];
  error: string | null;
  onDecide: (requestId: string, decision: 'allow' | 'always' | 'deny', reason?: string) => void;
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
      {thread.map((entry) =>
        entry.kind === 'approval' ? (
          <ApprovalBlock
            key={entry.id}
            entry={entry}
            onDecide={(decision, reason) => onDecide(entry.id, decision, reason)}
          />
        ) : (
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
        )
      )}
    </div>
  );
}
