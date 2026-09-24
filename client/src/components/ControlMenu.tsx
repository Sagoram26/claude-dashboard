import { useState } from 'react';

export type ControlOption = { value: string; label: string };

export function ControlMenu({
  label,
  options,
  value,
  onSelect,
  tone,
}: {
  label: string;
  options: ControlOption[];
  value: string | null;
  onSelect: (value: string) => void;
  tone?: 'neutral' | 'warn' | 'accent';
}) {
  const [ouvert, setOuvert] = useState(false);
  const courant = options.find((o) => o.value === value);

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="pill"
        data-tone={tone ?? 'neutral'}
        aria-haspopup="listbox"
        aria-expanded={ouvert}
        onClick={() => options.length > 0 && setOuvert((o) => !o)}
      >
        {courant?.label ?? value ?? label}
        <span style={{ opacity: 0.5 }}>▾</span>
      </button>

      {ouvert && (
        <ul
          role="listbox"
          aria-label={label}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 10,
            listStyle: 'none',
            margin: 0,
            padding: 4,
            minWidth: '100%',
            background: 'var(--surface-raised)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-card)',
          }}
        >
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  setOuvert(false);
                  onSelect(option.value);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '4px 8px',
                  border: 'none',
                  borderRadius: 'var(--radius-control)',
                  background: option.value === value ? 'var(--accent-soft)' : 'transparent',
                  color: 'var(--text)',
                  font: 'inherit',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
