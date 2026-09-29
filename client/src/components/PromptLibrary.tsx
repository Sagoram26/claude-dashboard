import { useEffect, useState } from 'react';
import type { PromptDefinition } from '../../../server/protocol.ts';

export type PromptLibraryProps = {
  prompts: PromptDefinition[];
  onLaunch: (prompt: PromptDefinition) => void;
  onSave: (prompt: PromptDefinition) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
};

let nextId = 0;
const genId = () => `prompt-${Date.now()}-${nextId++}`;

const emptyPrompt = (): PromptDefinition => ({ id: genId(), name: 'Nouveau prompt', text: '', pinned: false });

export function PromptLibrary({ prompts, onLaunch, onSave, onDelete, onTogglePin }: PromptLibraryProps) {
  const [drafts, setDrafts] = useState<PromptDefinition[]>(prompts);

  // I4 : useState(prop) ne fige que la valeur initiale. Sans resynchronisation, "Supprimer" laisse
  // la carte affichee jusqu'au prochain montage, "Enregistrer" peut la recreer, et l'etoile
  // d'epinglage ne suit pas un prompts.list recu du serveur. Un brouillon non enregistre est perdu
  // sur une mise a jour externe concurrente : acceptable en v1.
  useEffect(() => setDrafts(prompts), [prompts]);

  const updateDraft = (id: string, next: PromptDefinition) => {
    setDrafts((prev) => prev.map((p) => (p.id === id ? next : p)));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button type="button" className="pill" onClick={() => setDrafts((prev) => [...prev, emptyPrompt()])}>
        Nouveau prompt
      </button>

      {drafts.map((prompt) => (
        <div
          key={prompt.id}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-control)',
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <input
            aria-label="Nom du prompt"
            value={prompt.name}
            onChange={(e) => updateDraft(prompt.id, { ...prompt, name: e.target.value })}
            style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
          />
          <textarea
            aria-label="Texte du prompt"
            value={prompt.text}
            onChange={(e) => updateDraft(prompt.id, { ...prompt, text: e.target.value })}
            rows={3}
            style={{
              background: 'var(--surface)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              font: 'inherit',
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="pill" onClick={() => onLaunch(prompt)}>
              Lancer
            </button>
            <button type="button" className="pill" onClick={() => onSave(prompt)}>
              Enregistrer
            </button>
            <button
              type="button"
              className="pill"
              aria-pressed={prompt.pinned}
              onClick={() => onTogglePin(prompt.id)}
            >
              {prompt.pinned ? '★ Épinglé' : '☆ Épingler'}
            </button>
            <button type="button" className="pill" data-tone="warn" onClick={() => onDelete(prompt.id)}>
              Supprimer
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
