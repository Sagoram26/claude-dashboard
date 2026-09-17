import { useState } from 'react';

export function Composer({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
}) {
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <div style={{ flex: '0 0 auto', paddingBottom: 16 }}>
      <textarea
        aria-label="Message"
        value={text}
        disabled={disabled}
        rows={3}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        style={{
          width: '100%',
          resize: 'none',
          background: 'var(--surface-raised)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-control)',
          padding: 8,
          font: 'inherit',
        }}
        placeholder="Écrire un message…"
      />
    </div>
  );
}
