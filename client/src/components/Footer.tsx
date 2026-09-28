export type FooterItem = {
  text: string;
  tone?: 'neutral' | 'warn' | 'ok';
  align?: 'left' | 'right';
  onClick?: () => void;
};

const TONE_COLOR = {
  neutral: 'var(--text-muted)',
  warn: 'var(--warn)',
  ok: 'var(--ok)',
} as const;

export function Footer({ items }: { items: FooterItem[] }) {
  const left = items.filter((item) => item.align !== 'right');
  const right = items.filter((item) => item.align === 'right');

  const render = (item: FooterItem, index: number) => (
    <span
      key={`${item.text}-${index}`}
      onClick={item.onClick}
      style={{ color: TONE_COLOR[item.tone ?? 'neutral'], cursor: item.onClick ? 'pointer' : undefined }}
    >
      {item.text}
    </span>
  );

  return (
    <footer
      role="contentinfo"
      style={{
        height: 'var(--footer-h)',
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 10px',
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        fontSize: 11,
      }}
    >
      {left.map(render)}
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>{right.map(render)}</span>
    </footer>
  );
}
