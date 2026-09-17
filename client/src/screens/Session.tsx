import { useEffect, useReducer, useRef } from 'react';
import { TopBar, type ControlPill } from '../components/TopBar.tsx';
import { Footer, type FooterItem } from '../components/Footer.tsx';
import { Conversation } from '../components/Conversation.tsx';
import { Composer } from '../components/Composer.tsx';
import { connect, type Connection } from '../socket.ts';
import { initialState, reduceEvent } from '../state.ts';

const SOCKET_URL = `ws://${location.host}/ws`;

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
  const [state, dispatch] = useReducer(reduceEvent, initialState);
  const connection = useRef<Connection | null>(null);

  useEffect(() => {
    const conn = connect(SOCKET_URL, dispatch);
    connection.current = conn;
    return () => conn.close();
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar controls={PLACEHOLDER_CONTROLS} />
      <main role="main" style={{ flex: 1, minHeight: 0, display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            width: '100%',
            maxWidth: 'var(--conversation-max)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <Conversation messages={state.messages} />
          <Composer
            disabled={state.status === 'disconnected'}
            onSend={(text) => connection.current?.send({ type: 'message.send', text })}
          />
        </div>
      </main>
      <Footer items={PLACEHOLDER_FOOTER} />
    </div>
  );
}
