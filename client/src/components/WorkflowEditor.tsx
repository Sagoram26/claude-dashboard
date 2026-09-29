import { useEffect, useState } from 'react';
import type { WorkflowDefinition, WorkflowStep } from '../../../server/protocol.ts';

export type WorkflowEditorProps = {
  workflows: WorkflowDefinition[];
  availableModels: { value: string; displayName: string }[];
  availableAgents: { name: string; description: string }[];
  onSave: (workflow: WorkflowDefinition) => void;
  onDelete: (id: string) => void;
};

let nextId = 0;
const genId = (prefix: string) => `${prefix}-${Date.now()}-${nextId++}`;

const emptyStep = (): WorkflowStep => ({ id: genId('step'), label: '', prompt: '', gate: false });

const emptyWorkflow = (): WorkflowDefinition => ({
  id: genId('workflow'),
  name: 'Nouveau workflow',
  steps: [emptyStep()],
});

/**
 * I5, meme liste que MODES_OFFERTS dans server/session/manager.ts (et que MODES dans
 * client/src/screens/Session.tsx) : pas d'import cross-couche pour si peu, tenir la liste a jour a
 * la main si le SDK en expose un nouveau.
 */
const MODES_PERMISSION = ['default', 'acceptEdits', 'plan', 'dontAsk', 'auto'];

function StepEditor({
  step,
  availableModels,
  onChange,
  onRemove,
  canRemove,
}: {
  step: WorkflowStep;
  availableModels: WorkflowEditorProps['availableModels'];
  onChange: (step: WorkflowStep) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-control)',
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <input
        aria-label="Nom de l'étape"
        value={step.label}
        onChange={(e) => onChange({ ...step, label: e.target.value })}
        style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
      />
      <textarea
        aria-label="Prompt"
        value={step.prompt}
        onChange={(e) => onChange({ ...step, prompt: e.target.value })}
        rows={3}
        style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', font: 'inherit' }}
      />
      <select
        aria-label="Modèle"
        value={step.model ?? ''}
        onChange={(e) => onChange({ ...step, model: e.target.value || undefined })}
      >
        <option value="">— défaut —</option>
        {availableModels.map((m) => (
          <option key={m.value} value={m.value}>
            {m.displayName}
          </option>
        ))}
      </select>
      <select
        aria-label="Mode de permission"
        value={step.permissionMode ?? ''}
        onChange={(e) => onChange({ ...step, permissionMode: e.target.value || undefined })}
      >
        <option value="">— défaut —</option>
        {MODES_PERMISSION.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          role="checkbox"
          aria-label="Barrière"
          checked={step.gate}
          onChange={(e) => onChange({ ...step, gate: e.target.checked })}
        />
        Barrière
      </label>
      {canRemove && (
        <button type="button" className="pill" data-tone="warn" onClick={onRemove}>
          Retirer
        </button>
      )}
    </div>
  );
}

export function WorkflowEditor({
  workflows,
  availableModels,
  // I5 (option a) : conserve pour la forme de l'API (le champ WorkflowStep.subagent reste dans le
  // type/le store), mais plus utilisee par le rendu — le select trompeur qui la consommait est
  // retire (voir StepEditor).
  onSave,
  onDelete,
}: WorkflowEditorProps) {
  const [drafts, setDrafts] = useState<WorkflowDefinition[]>(workflows);

  // I4 : voir la meme note dans PromptLibrary.tsx — useState(prop) ne se resynchronise jamais tout
  // seul avec une mise a jour externe (workflows.list recu du serveur).
  useEffect(() => setDrafts(workflows), [workflows]);

  const updateDraft = (id: string, next: WorkflowDefinition) => {
    setDrafts((prev) => prev.map((w) => (w.id === id ? next : w)));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button type="button" className="pill" onClick={() => setDrafts((prev) => [...prev, emptyWorkflow()])}>
        Nouveau workflow
      </button>

      {drafts.map((workflow) => (
        <div
          key={workflow.id}
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
            aria-label="Nom du workflow"
            value={workflow.name}
            onChange={(e) => updateDraft(workflow.id, { ...workflow, name: e.target.value })}
            style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
          />

          {workflow.steps.map((step, index) => (
            <StepEditor
              key={step.id}
              step={step}
              availableModels={availableModels}
              onChange={(nextStep) =>
                updateDraft(workflow.id, {
                  ...workflow,
                  steps: workflow.steps.map((s, i) => (i === index ? nextStep : s)),
                })
              }
              canRemove={workflow.steps.length > 1}
              onRemove={() =>
                updateDraft(workflow.id, {
                  ...workflow,
                  steps: workflow.steps.filter((_, i) => i !== index),
                })
              }
            />
          ))}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="pill"
              onClick={() =>
                updateDraft(workflow.id, { ...workflow, steps: [...workflow.steps, emptyStep()] })
              }
            >
              Ajouter une étape
            </button>
            <button type="button" className="pill" onClick={() => onSave(workflow)}>
              Enregistrer
            </button>
            <button type="button" className="pill" data-tone="warn" onClick={() => onDelete(workflow.id)}>
              Supprimer
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
