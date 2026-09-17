import { TopBar, type ControlPill } from '../components/TopBar.tsx';
import { Footer, type FooterItem } from '../components/Footer.tsx';

const PLACEHOLDER_CONTROLS: ControlPill[] = [
  { label: 'Opus 5' },
  { label: 'high' },
  { label: 'acceptEdits' },
  { label: 'TDD', dashed: true },
];

const PLACEHOLDER_FOOTER: FooterItem[] = [
  { text: 'main' },
  { text: 'claude-dashboard' },
  { text: '$0.00', align: 'right' },
  { text: 'connecté', tone: 'ok', align: 'right' },
];

export function Session() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar controls={PLACEHOLDER_CONTROLS} />
      <main role="main" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div style={{ width: '100%', maxWidth: 'var(--conversation-max)', flex: 1, padding: 16 }} />
        </div>
      </main>
      <Footer items={PLACEHOLDER_FOOTER} />
    </div>
  );
}
