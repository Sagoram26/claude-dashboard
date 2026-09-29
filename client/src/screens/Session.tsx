import { useEffect, useReducer, useRef, useState } from 'react';
import { TopBar } from '../components/TopBar.tsx';
import { ControlMenu } from '../components/ControlMenu.tsx';
import { Footer } from '../components/Footer.tsx';
import { Conversation } from '../components/Conversation.tsx';
import { Composer } from '../components/Composer.tsx';
import { GeneratingIndicator } from '../components/GeneratingIndicator.tsx';
import { PendingApprovalBar } from '../components/PendingApprovalBar.tsx';
import { Sidebar, type SidebarColumn } from '../components/Sidebar.tsx';
import { ContextPopover } from '../components/ContextPopover.tsx';
import { Settings } from './Settings.tsx';
import { connect, type Connection } from '../socket.ts';
import { initialState, reduceEvent, type ApprovalEntry } from '../state.ts';

const SOCKET_URL = `ws://${location.host}/ws`;

const MODES = ['default', 'acceptEdits', 'plan', 'dontAsk', 'auto'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

const CONTEXT_ALERT_THRESHOLD = 80;

function nomDuProjet(cwd: string): string {
  const segments = cwd.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? cwd;
}

export function Session() {
  const [state, dispatch] = useReducer(reduceEvent, initialState);
  const connection = useRef<Connection | null>(null);
  const [screen, setScreen] = useState<'session' | 'settings'>('session');
  const [sidebarColumn, setSidebarColumn] = useState<SidebarColumn>('accueil');
  const [contextPopoverOpen, setContextPopoverOpen] = useState(false);
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <TopBar onOpenSettings={() => setScreen('settings')}>
        {state.currentWorkflowStep !== null && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            ▸ étape {state.currentWorkflowStep.index + 1}/{state.currentWorkflowStep.total}
          </span>
        )}
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
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Sidebar
          column={sidebarColumn}
          onSelectColumn={setSidebarColumn}
          changedFiles={state.changedFiles}
          toolActivityCount={state.toolActivityCount}
          availableCommands={state.availableCommands}
          availableAgents={state.availableAgents}
          mcpServers={state.mcpServers}
          prompts={[]}
          onLaunchPrompt={() => {}}
          onSavePrompt={() => {}}
          onDeletePrompt={() => {}}
          onTogglePinPrompt={() => {}}
        />
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
              // TODO couture feature 06 : aucun ClientCommand pour la barrière n'existe encore
              // côté protocole (workflow.resume ne couvre que la reprise, pas "corriger"). Câblage
              // réel laissé à la feature qui introduira ce canal.
              onWorkflowGateAction={() => {}}
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
      </div>
      <Footer
        items={[
          state.git
            ? { text: `${state.git.branch} · ${state.git.dirty} modifié(s) · ${state.git.staged} en stage` }
            : { text: '—' },
          { text: nomDuProjet(state.cwd) },
          {
            text: `${state.availableCommands.length} skills · ${state.mcpServers.length} MCP`,
            onClick: () => setSidebarColumn('skills'),
          },
          { text: `$${state.costUsd.toFixed(2)}`, align: 'right' },
          ...(state.contextUsage
            ? [
                {
                  text: `${state.contextUsage.percentage}%`,
                  tone:
                    state.contextUsage.percentage >= CONTEXT_ALERT_THRESHOLD
                      ? ('warn' as const)
                      : ('neutral' as const),
                  align: 'right' as const,
                  onClick: () => {
                    setContextPopoverOpen(true);
                    connection.current?.send({ type: 'context.request-full' });
                  },
                },
              ]
            : []),
          {
            text: state.status === 'disconnected' ? 'déconnecté' : 'connecté',
            tone: state.status === 'disconnected' ? 'warn' : 'ok',
            align: 'right',
          },
        ]}
      />
      <ContextPopover
        open={contextPopoverOpen}
        usage={state.contextUsage}
        onCompact={() => connection.current?.send({ type: 'context.compact' })}
        onClose={() => setContextPopoverOpen(false)}
      />
    </div>
  );
}
