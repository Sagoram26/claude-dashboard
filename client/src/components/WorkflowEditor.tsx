import { useState } from 'react';
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

function StepEditor({
  step,
  availableModels,
  availableAgents,
  onChange,
}: {
  step: WorkflowStep;
  availableModels: WorkflowEditorProps['availableModels'];
  availableAgents: WorkflowEditorProps['availableAgents'];
  onChange: (step: WorkflowStep) => void;
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
        aria-label="Subagent"
        value={step.subagent ?? ''}
        onChange={(e) => onChange({ ...step, subagent: e.target.value || undefined })}
      >
        <option value="">— agent principal —</option>
        {availableAgents.map((a) => (
          <option key={a.name} value={a.name}>
            {a.name}
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
    </div>
  );
}

export function WorkflowEditor({
  workflows,
  availableModels,
  availableAgents,
  onSave,
  onDelete,
}: WorkflowEditorProps) {
  const [drafts, setDrafts] = useState<WorkflowDefinition[]>(workflows);

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
          <div style={{ fontSize: 13, color: 'var(--text)' }}>{workflow.name}</div>

          {workflow.steps.map((step, index) => (
            <StepEditor
              key={step.id}
              step={step}
              availableModels={availableModels}
              availableAgents={availableAgents}
              onChange={(nextStep) =>
                updateDraft(workflow.id, {
                  ...workflow,
                  steps: workflow.steps.map((s, i) => (i === index ? nextStep : s)),
                })
              }
            />
          ))}

          <div style={{ display: 'flex', gap: 8 }}>
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
