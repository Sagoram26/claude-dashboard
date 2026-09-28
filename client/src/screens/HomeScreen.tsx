import { useEffect, useState } from 'react';

export type HomeSession = {
  cwd: string;
  sessionId: string;
  title: string;
  branch: string | null;
  lastActivity: string;
  fromDashboard: boolean;
  resumable: boolean;
};

export type HomeScreenProps = {
  onOpen: (session: { cwd: string; sessionId: string }) => void;
  /** Injectable pour les tests ; par défaut `fetch('/sessions')`. */
  fetchSessions?: () => Promise<HomeSession[]>;
};

function nomDuProjet(cwd: string): string {
  const segments = cwd.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? cwd;
}

export function HomeScreen({ onOpen, fetchSessions }: HomeScreenProps) {
  const [sessions, setSessions] = useState<HomeSession[] | null>(null);
  const [filtre, setFiltre] = useState('');

  useEffect(() => {
    const charger = fetchSessions ?? (() => fetch('/sessions').then((r) => r.json() as Promise<HomeSession[]>));
    let annule = false;
    void charger()
      .then((s) => { if (!annule) setSessions(s); })
      .catch(() => { if (!annule) setSessions([]); });
    return () => { annule = true; };
  }, [fetchSessions]);

  const toutes = sessions ?? [];
  const filtrees = filtre.length === 0
    ? toutes
    : toutes.filter((s) => s.cwd.toLowerCase().includes(filtre.toLowerCase()));
  const dossiers = [...new Set(filtrees.map((s) => s.cwd))];

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ marginBottom: 16 }}>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
          Ouvrir un dossier
        </span>
        <input
          aria-label="Ouvrir un dossier"
          value={filtre}
          onChange={(e) => setFiltre(e.target.value)}
          placeholder="Filtrer les dossiers récents…"
          style={{
            display: 'block',
            width: '100%',
            background: 'var(--surface-raised)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-control)',
            padding: 8,
            font: 'inherit',
          }}
        />
      </div>

      <section aria-label="Dossiers récents" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          Dossiers récents
        </h2>
        {dossiers.map((d) => (
          <div key={d} className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {nomDuProjet(d)}
          </div>
        ))}
      </section>

      <section aria-label="Sessions reprenables">
        <h2 style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          Sessions
        </h2>
        {sessions === null && <div style={{ color: 'var(--text-faint)' }}>Chargement…</div>}
        {filtrees.map((s) => (
          <div
            key={s.sessionId}
            data-session
            role="button"
            tabIndex={0}
            onClick={() => s.resumable && onOpen({ cwd: s.cwd, sessionId: s.sessionId })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && s.resumable) onOpen({ cwd: s.cwd, sessionId: s.sessionId });
            }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              padding: 10,
              marginTop: 6,
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card)',
              cursor: s.resumable ? 'pointer' : 'default',
              opacity: s.resumable ? 1 : 0.7,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{s.title}</strong>
              <span style={{ color: s.resumable ? 'var(--ok)' : 'var(--text-faint)', fontSize: 11 }}>
                {s.resumable ? 'vivant' : 'au repos'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {nomDuProjet(s.cwd)} · {s.branch ?? '—'} · {new Date(s.lastActivity).toLocaleString()}
            </div>
            {!s.fromDashboard && (
              <div style={{ fontSize: 11, color: 'var(--warn)' }}>
                Non reprenable — session lancée hors du dashboard
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
