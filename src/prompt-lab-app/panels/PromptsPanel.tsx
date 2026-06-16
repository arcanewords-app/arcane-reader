import { useCallback, useEffect, useState } from 'preact/hooks';
import type { LabPrompt } from '../api/client';
import { deletePrompt, fetchCurrentPrompt, fetchPrompts, updatePrompt } from '../api/client';
import { ConfirmModal } from '../components/ConfirmModal';
import { PlDiffView } from '../components/PlDiffView';
import { PlModal } from '../components/PlModal';

interface Props {
  active: boolean;
  onLoad: (prompt: LabPrompt) => void;
}

export function PromptsPanel({ active, onLoad }: Props) {
  const [prompts, setPrompts] = useState<LabPrompt[]>([]);
  const [selected, setSelected] = useState<LabPrompt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSystem, setEditSystem] = useState('');
  const [editUser, setEditUser] = useState('');
  const [baselineSystem, setBaselineSystem] = useState('');
  const [showDiff, setShowDiff] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { prompts: rows } = await fetchPrompts();
      setPrompts(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, []);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const selectPrompt = async (p: LabPrompt) => {
    setSelected(p);
    setEditName(p.name);
    setEditSystem(p.systemPrompt);
    setEditUser(p.userPromptOverride ?? '');
    setEditing(false);
    setShowDiff(false);
    try {
      const baseline = await fetchCurrentPrompt({
        stage: p.stage,
        source: p.sourceLanguage,
        target: p.targetLanguage,
        preset: p.preset ?? undefined,
        focus: p.focus ?? undefined,
      });
      setBaselineSystem(baseline.systemPrompt);
    } catch {
      setBaselineSystem('');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deletePrompt(deleteId);
    if (selected?.id === deleteId) setSelected(null);
    setDeleteId(null);
    await load();
  };

  const handleSaveEdit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await updatePrompt(selected.id, {
        name: editName.trim() || selected.name,
        systemPrompt: editSystem,
        userPromptOverride: editUser.trim() ? editUser : null,
      });
      setSelected(updated);
      setEditing(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div class="pl-split">
        <div class="pl-pane">
          <div class="pl-toolbar">
            <button type="button" class="pl-btn secondary" onClick={() => void load()}>
              Refresh
            </button>
          </div>
          {error ? <p class="pl-error">{error}</p> : null}
          <ul class="pl-list">
            {prompts.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  class={`pl-list-btn${selected?.id === p.id ? ' selected' : ''}`}
                  onClick={() => void selectPrompt(p)}
                >
                  <strong>{p.name}</strong>
                  <span class="pl-muted">
                    {' '}
                    {p.stage} {p.sourceLanguage}→{p.targetLanguage}
                  </span>
                  <div class="pl-muted">{p.origin}</div>
                </button>
              </li>
            ))}
          </ul>
          {!prompts.length && !error ? <p class="pl-muted">No saved prompt versions yet.</p> : null}
        </div>
        <div class="pl-pane">
          {selected ? (
            <>
              <div class="pl-row">
                <button type="button" class="pl-btn" onClick={() => onLoad(selected)}>
                  Load in workbench
                </button>
                <button type="button" class="pl-btn secondary" onClick={() => setEditing(true)}>
                  Edit
                </button>
                <button
                  type="button"
                  class="pl-btn secondary"
                  onClick={() => setShowDiff((v) => !v)}
                >
                  {showDiff ? 'Hide diff' : 'Diff vs code'}
                </button>
                <button
                  type="button"
                  class="pl-btn danger"
                  onClick={() => setDeleteId(selected.id)}
                >
                  Delete
                </button>
              </div>
              {showDiff ? (
                <PlDiffView baseline={baselineSystem} current={selected.systemPrompt} />
              ) : (
                <>
                  <span class="pl-label">System prompt</span>
                  <textarea class="pl-textarea" readOnly value={selected.systemPrompt} />
                  {selected.userPromptOverride ? (
                    <>
                      <span class="pl-label">User override</span>
                      <textarea class="pl-textarea" readOnly value={selected.userPromptOverride} />
                    </>
                  ) : null}
                </>
              )}
            </>
          ) : (
            <p class="pl-muted">Select a saved prompt version.</p>
          )}
        </div>
      </div>

      <PlModal
        open={editing && Boolean(selected)}
        title="Edit prompt version"
        onClose={() => setEditing(false)}
        footer={
          <div class="pl-row">
            <button type="button" class="pl-btn secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              type="button"
              class="pl-btn"
              disabled={saving}
              onClick={() => void handleSaveEdit()}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        }
      >
        <label class="pl-field">
          <span class="pl-label">Name</span>
          <input
            class="pl-input pl-input--full"
            value={editName}
            onInput={(e) => setEditName(e.currentTarget.value)}
          />
        </label>
        <label class="pl-field">
          <span class="pl-label">System prompt</span>
          <textarea
            class="pl-textarea pl-textarea--compact"
            value={editSystem}
            onInput={(e) => setEditSystem(e.currentTarget.value)}
          />
        </label>
        <label class="pl-field">
          <span class="pl-label">User override (optional)</span>
          <textarea
            class="pl-textarea pl-textarea--compact"
            value={editUser}
            onInput={(e) => setEditUser(e.currentTarget.value)}
          />
        </label>
      </PlModal>

      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete prompt version"
        message="Delete this prompt version?"
        confirmLabel="Delete"
        danger
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </>
  );
}
