export type ControlPill = {
  label: string;
  tone?: 'neutral' | 'warn' | 'accent';
  dashed?: boolean;
};

export function TopBar({ controls }: { controls: ControlPill[] }) {
  return (
    <header
      role="banner"
      style={{
        height: 'var(--topbar-h)',
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        padding: '0 10px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {controls.map((control) => (
        <button
          key={control.label}
          className="pill"
          data-tone={control.tone ?? 'neutral'}
          data-dashed={control.dashed ? 'true' : undefined}
        >
          {control.label}
          <span style={{ opacity: 0.5 }}>▾</span>
        </button>
      ))}
      <span style={{ marginLeft: 'auto', color: 'var(--text-faint)', fontSize: 11 }}>⌘K</span>
    </header>
  );
}
