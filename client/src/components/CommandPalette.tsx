import { useState } from 'react';

export type PaletteItem = {
  id: string;
  type: 'prompt' | 'skill' | 'subagent';
  label: string;
  description?: string;
};

export type CommandPaletteProps = {
  open: boolean;
  items: PaletteItem[];
  onSelect: (item: PaletteItem) => void;
  onClose: () => void;
};

const typeTabs: { value: PaletteItem['type'] | 'all'; label: string }[] = [
  { value: 'all', label: 'Tout' },
  { value: 'prompt', label: 'Prompts' },
  { value: 'skill', label: 'Skills' },
  { value: 'subagent', label: 'Subagents' },
];

export function CommandPalette({ open, items, onSelect, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<PaletteItem['type'] | 'all'>('all');

  if (!open) return null;

  const needle = query.trim().toLowerCase();
  const filtered = items.filter((item) => {
    if (typeFilter !== 'all' && item.type !== typeFilter) return false;
    if (!needle) return true;
    return (
      item.label.toLowerCase().includes(needle) ||
      (item.description?.toLowerCase().includes(needle) ?? false)
    );
  });

  return (
    <div
      role="dialog"
      aria-label="Palette de commandes"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '10vh',
        background: 'rgba(0, 0, 0, 0.4)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 480,
          maxWidth: '90vw',
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface-raised)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-card)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="text"
          aria-label="Rechercher une commande"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && filtered.length > 0) onSelect(filtered[0]!);
          }}
          placeholder="Rechercher une commande..."
          style={{
            padding: '10px 12px',
            border: 'none',
            borderBottom: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text)',
            font: 'inherit',
            fontSize: 13,
          }}
        />

        <div style={{ display: 'flex', gap: 4, padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
          {typeTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className="pill"
              data-tone={typeFilter === tab.value ? 'accent' : 'neutral'}
              aria-pressed={typeFilter === tab.value}
              onClick={() => setTypeFilter(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <ul
          role="listbox"
          aria-label="Résultats"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 4,
            overflowY: 'auto',
          }}
        >
          {filtered.length === 0 && (
            <li style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: 12 }}>Aucun résultat</li>
          )}
          {filtered.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => onSelect(item)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 2,
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 8px',
                  border: 'none',
                  borderRadius: 'var(--radius-control)',
                  background: 'transparent',
                  color: 'var(--text)',
                  font: 'inherit',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                <span>{item.label}</span>
                {item.description && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.description}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
