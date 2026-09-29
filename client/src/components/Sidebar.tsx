import { useEffect, useState, type ReactNode } from 'react';
import type { ChangedFile, PromptDefinition } from '../../../server/protocol.ts';
import { PromptLibrary } from './PromptLibrary.tsx';

export type SidebarColumn = 'accueil' | 'skills' | 'lancer';

export type SidebarProps = {
  column: SidebarColumn;
  onSelectColumn: (column: SidebarColumn) => void;
  changedFiles: ChangedFile[];
  toolActivityCount: number;
  availableCommands: { name: string; description: string }[];
  availableAgents: { name: string; description: string }[];
  mcpServers: { name: string; status: string; toolCount: number; error?: string }[];
  prompts: PromptDefinition[];
  onLaunchPrompt: (prompt: PromptDefinition) => void;
  onSavePrompt: (prompt: PromptDefinition) => void;
  onDeletePrompt: (id: string) => void;
  onTogglePinPrompt: (id: string) => void;
};

function useCollapsed(id: string, defaultCollapsed: boolean) {
  const key = `sidebar.collapsed.${id}`;
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem(key);
    return stored === null ? defaultCollapsed : stored === '1';
  });
  useEffect(() => {
    localStorage.setItem(key, collapsed ? '1' : '0');
  }, [key, collapsed]);
  return [collapsed, setCollapsed] as const;
}

function Section({
  id,
  title,
  defaultCollapsed,
  children,
}: {
  id: string;
  title: string;
  defaultCollapsed: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useCollapsed(id, defaultCollapsed);
  return (
    <div>
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: 'flex',
          width: '100%',
          justifyContent: 'space-between',
          background: 'none',
          border: 'none',
          color: 'var(--text-muted)',
          font: 'inherit',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          padding: '6px 0',
          cursor: 'pointer',
        }}
      >
        <span>{title}</span>
        <span>{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && <div style={{ paddingBottom: 8 }}>{children}</div>}
    </div>
  );
}

const COLONNES: { id: SidebarColumn; label: string; icon: string }[] = [
  { id: 'accueil', label: 'Accueil', icon: '⌂' },
  { id: 'skills', label: 'Skills et MCP', icon: '◆' },
  { id: 'lancer', label: 'Lancer', icon: '▶' },
];

export function Sidebar(props: SidebarProps) {
  const totalDelta = props.changedFiles.reduce((n, f) => n + f.added + f.removed, 0);

  return (
    <aside
      style={{
        width: 'var(--sidebar-w)',
        flex: '0 0 auto',
        borderRight: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflowY: 'auto',
        padding: '8px 10px',
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {COLONNES.map((c) => (
          <button
            key={c.id}
            type="button"
            className="pill"
            aria-pressed={props.column === c.id}
            data-tone={props.column === c.id ? 'accent' : undefined}
            onClick={() => props.onSelectColumn(c.id)}
          >
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      {props.column === 'accueil' && (
        <>
          <Section id="fichiers" title={`Fichiers modifiés (${totalDelta})`} defaultCollapsed={false}>
            {props.changedFiles.length === 0 ? (
              <div style={{ color: 'var(--text-faint)' }}>Aucun fichier modifié</div>
            ) : (
              props.changedFiles.map((f) => (
                <div key={f.path} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="mono">{f.path}</span>
                  <span>
                    <span style={{ color: 'var(--ok)' }}>+{f.added}</span>{' '}
                    <span style={{ color: 'var(--danger)' }}>−{f.removed}</span>
                  </span>
                </div>
              ))
            )}
          </Section>
          <Section id="favoris" title="Favoris" defaultCollapsed={false}>
            {props.prompts.filter((p) => p.pinned).length === 0 ? (
              <div style={{ color: 'var(--text-faint)' }}>Aucun favori</div>
            ) : (
              props.prompts
                .filter((p) => p.pinned)
                .map((p) => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{p.name}</span>
                    <button type="button" className="pill" onClick={() => props.onLaunchPrompt(p)}>
                      Lancer
                    </button>
                  </div>
                ))
            )}
          </Section>
          <Section
            id="activite"
            title={`Activité (${props.toolActivityCount})`}
            defaultCollapsed={true}
          >
            <div style={{ color: 'var(--text-faint)' }}>{props.toolActivityCount} appel(s) d'outil</div>
          </Section>
        </>
      )}

      {props.column === 'skills' && (
        <>
          <Section id="skills-liste" title="Skills" defaultCollapsed={false}>
            {props.availableCommands.length === 0 ? (
              <div style={{ color: 'var(--text-faint)' }}>Aucun skill</div>
            ) : (
              props.availableCommands.map((c) => (
                <div key={c.name} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span aria-hidden style={{ color: 'var(--ok)' }}>●</span>
                  <span>{c.name}</span>
                </div>
              ))
            )}
          </Section>
          <Section id="mcp" title="Serveurs MCP" defaultCollapsed={false}>
            {props.mcpServers.length === 0 ? (
              <div style={{ color: 'var(--text-faint)' }}>Aucun serveur MCP</div>
            ) : (
              props.mcpServers.map((s) => (
                <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{s.name}</span>
                  <span style={{ color: s.status === 'connected' ? 'var(--text-muted)' : 'var(--warn)' }}>
                    {s.toolCount} outils · {s.status}
                  </span>
                </div>
              ))
            )}
          </Section>
          <Section id="hooks" title="Hooks" defaultCollapsed={true}>
            <div style={{ color: 'var(--text-faint)' }}>Aucun hook à afficher</div>
          </Section>
        </>
      )}

      {props.column === 'lancer' && (
        <>
          <Section id="prompts" title="Prompts" defaultCollapsed={false}>
            <PromptLibrary
              prompts={props.prompts}
              onLaunch={props.onLaunchPrompt}
              onSave={props.onSavePrompt}
              onDelete={props.onDeletePrompt}
              onTogglePin={props.onTogglePinPrompt}
            />
          </Section>
          <Section id="subagents" title="Subagents" defaultCollapsed={false}>
            {props.availableAgents.map((a) => (
              <div key={a.name}>{a.name}</div>
            ))}
            <div style={{ color: 'var(--text-faint)' }}>Fan-out — désactivé en v1</div>
          </Section>
          <Section id="workflows" title="Workflows" defaultCollapsed={false}>
            <div style={{ color: 'var(--text-faint)' }}>Workflows — à venir</div>
          </Section>
        </>
      )}
    </aside>
  );
}
