import { useEffect, useReducer, useRef } from 'react';
import { TopBar, type ControlPill } from '../components/TopBar.tsx';
import { Footer, type FooterItem } from '../components/Footer.tsx';
import { Conversation } from '../components/Conversation.tsx';
import { Composer } from '../components/Composer.tsx';
import { GeneratingIndicator } from '../components/GeneratingIndicator.tsx';
import { PendingApprovalBar } from '../components/PendingApprovalBar.tsx';
import { connect, type Connection } from '../socket.ts';
import { initialState, reduceEvent, type ApprovalEntry } from '../state.ts';

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
  const pendingApprovals = state.thread.filter(
    (e): e is ApprovalEntry => e.kind === 'approval' && e.decision === null
  );

  useEffect(() => {
    const conn = connect(SOCKET_URL, dispatch);
    connection.current = conn;
    return () => conn.close();
  }, []);

  useEffect(() => {
    if (state.status !== 'generating') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') connection.current?.send({ type: 'session.interrupt' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.status]);

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
          <Conversation
            thread={state.thread}
            error={state.error}
            onDecide={(requestId, decision, reason) =>
              connection.current?.send({ type: 'permission.respond', requestId, decision, reason })
            }
          />
          {state.status === 'generating' && (
            <GeneratingIndicator
              onInterrupt={() => connection.current?.send({ type: 'session.interrupt' })}
            />
          )}
          <PendingApprovalBar
            pending={pendingApprovals}
            onAllow={(requestId) =>
              connection.current?.send({ type: 'permission.respond', requestId, decision: 'allow' })
            }
            onReveal={(requestId) =>
              document
                .querySelector(`[data-approval="${requestId}"]`)
                ?.scrollIntoView({ block: 'center', behavior: 'auto' })
            }
          />
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
