import type { ChatMessage } from '../state.ts';

export function Conversation({ messages, error }: { messages: ChatMessage[]; error: string | null }) {
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
      {messages.map((message) => (
        <article
          key={message.id}
          data-role={message.role}
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: message.role === 'user' ? 'var(--text-muted)' : 'var(--text)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {message.text}
        </article>
      ))}
    </div>
  );
}
