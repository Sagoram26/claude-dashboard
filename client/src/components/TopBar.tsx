import type { ReactNode } from 'react';

export function TopBar({
  children,
  onOpenSettings,
}: {
  children?: ReactNode;
  onOpenSettings?: () => void;
}) {
  return (
    <header
      role="banner"
      style={{
        height: 'var(--topbar-h)',
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 10px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {children}
      <button
        type="button"
        className="pill"
        aria-label="Réglages"
        style={{ marginLeft: 'auto' }}
        onClick={onOpenSettings}
      >
        ⚙
      </button>
      <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>⌘K</span>
    </header>
  );
}
