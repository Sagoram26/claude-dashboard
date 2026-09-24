import { useEffect, useReducer, useRef, useState } from 'react';
import { TopBar } from '../components/TopBar.tsx';
import { ControlMenu } from '../components/ControlMenu.tsx';
import { Footer, type FooterItem } from '../components/Footer.tsx';
import { Conversation } from '../components/Conversation.tsx';
import { Composer } from '../components/Composer.tsx';
import { GeneratingIndicator } from '../components/GeneratingIndicator.tsx';
import { PendingApprovalBar } from '../components/PendingApprovalBar.tsx';
import { Settings } from './Settings.tsx';
import { connect, type Connection } from '../socket.ts';
import { initialState, reduceEvent, type ApprovalEntry } from '../state.ts';

const SOCKET_URL = `ws://${location.host}/ws`;

const MODES = ['default', 'acceptEdits', 'plan', 'dontAsk', 'auto'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

const PLACEHOLDER_FOOTER: FooterItem[] = [
  { text: 'main' },
  { text: 'claude-dashboard' },
  { text: '$0.00', align: 'right' },
  { text: 'connecté', tone: 'ok', align: 'right' },
];

export function Session() {
  const [state, dispatch] = useReducer(reduceEvent, initialState);
  const connection = useRef<Connection | null>(null);
  const [screen, setScreen] = useState<'session' | 'settings'>('session');
  const pendingApprovals = state.thread.filter(
    (e): e is ApprovalEntry => e.kind === 'approval' && e.decision === null
  );

  useEffect(() => {
    const conn = connect(SOCKET_URL, dispatch);
    connection.current = conn;
    return () => conn.close();
  }, []);

  useEffect(() => {
    if (screen !== 'session' || state.status !== 'generating') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') connection.current?.send({ type: 'session.interrupt' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, state.status]);

  const set = (reglage: 'model' | 'effort' | 'permissionMode') => (value: string) =>
    connection.current?.send({ type: 'runtime.set', [reglage]: value });

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar onOpenSettings={() => setScreen('settings')}>
        <ControlMenu
          label="Modèle"
          options={state.availableModels.map((m) => ({ value: m.value, label: m.displayName }))}
          value={state.model}
          onSelect={set('model')}
        />
        <ControlMenu
          label="Effort"
          options={EFFORTS.map((e) => ({ value: e, label: e }))}
          value={state.effort}
          onSelect={set('effort')}
        />
        <ControlMenu
          label="Mode"
          options={MODES.map((m) => ({ value: m, label: m }))}
          value={state.permissionMode}
          onSelect={set('permissionMode')}
          tone={state.permissionMode === 'default' ? 'warn' : 'neutral'}
        />
      </TopBar>
      <main role="main" style={{ flex: 1, minHeight: 0, display: 'flex', justifyContent: 'center' }}>
        {screen === 'settings' ? (
          <Settings
            granted={state.granted}
            onRevoke={(toolName) => connection.current?.send({ type: 'permission.revoke', toolName })}
            onClose={() => setScreen('session')}
          />
        ) : (
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
        )}
      </main>
      <Footer items={PLACEHOLDER_FOOTER} />
    </div>
  );
}
