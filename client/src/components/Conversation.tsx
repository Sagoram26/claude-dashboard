import type { ChatMessage } from '../state.ts';

export function Conversation({ messages }: { messages: ChatMessage[] }) {
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
