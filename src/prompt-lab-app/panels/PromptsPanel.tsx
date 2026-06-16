import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import type { LabPrompt, LabStage } from '../api/client';
import { deletePrompt, fetchCurrentPrompt, fetchPrompts, updatePrompt } from '../api/client';
import { ConfirmModal } from '../components/ConfirmModal';
import { PlDiffView } from '../components/PlDiffView';
import { PlModal } from '../components/PlModal';
import { PromptMetaBadges } from '../components/PromptMetaBadges';
import {
  DEFAULT_PROMPT_FILTERS,
  filterPrompts,
  hasActivePromptFilters,
  uniquePromptLangPairs,
  type PromptListFilters,
} from '../utils/runFilters';

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
  const [filters, setFilters] = useState<PromptListFilters>(DEFAULT_PROMPT_FILTERS);

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

  const langPairOptions = useMemo(() => uniquePromptLangPairs(prompts), [prompts]);
  const filtered = useMemo(() => filterPrompts(prompts, filters), [prompts, filters]);

  const setFilter = <K extends keyof PromptListFilters>(key: K, value: PromptListFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => setFilters(DEFAULT_PROMPT_FILTERS);

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
          <div class="pl-filter-bar">
            <input
              class="pl-input pl-search-input"
              type="search"
              placeholder="Search prompts…"
              value={filters.search}
              onInput={(e) => setFilter('search', e.currentTarget.value)}
            />
            <select
              class="pl-select"
              value={filters.stage}
              onChange={(e) => setFilter('stage', e.currentTarget.value as LabStage | '')}
            >
              <option value="">All stages</option>
              <option value="analyze">analyze</option>
              <option value="translate">translate</option>
              <option value="edit">edit</option>
            </select>
            <select
              class="pl-select"
              value={filters.langPair}
              onChange={(e) => setFilter('langPair', e.currentTarget.value)}
            >
              <option value="">All pairs</option>
              {langPairOptions.map((pair) => (
                <option key={pair} value={pair}>
                  {pair}
                </option>
              ))}
            </select>
            <button type="button" class="pl-btn secondary" onClick={() => void load()}>
              Refresh
            </button>
          </div>
          <p class="pl-filter-count">
            {filtered.length} shown · {prompts.length} total
          </p>
          {error ? <p class="pl-error">{error}</p> : null}
          <ul class="pl-list">
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  class={`pl-list-btn pl-run-card${selected?.id === p.id ? ' selected' : ''}`}
                  style={{ borderLeftColor: 'var(--pl-accent)' }}
                  onClick={() => void selectPrompt(p)}
                >
                  <strong class="pl-run-card__title">{p.name}</strong>
                  <PromptMetaBadges prompt={p} />
                  <div class="pl-run-card__meta">
                    Updated {new Date(p.updatedAt).toLocaleString()}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {!filtered.length && !error && prompts.length > 0 && hasActivePromptFilters(filters) ? (
            <div class="pl-filter-empty">
              <p>No prompts match filters.</p>
              <button type="button" class="pl-btn secondary" onClick={clearFilters}>
                Clear filters
              </button>
            </div>
          ) : null}
          {!prompts.length && !error ? <p class="pl-muted">No saved prompt versions yet.</p> : null}
        </div>
        <div class="pl-pane">
          {selected ? (
            <>
              <PromptMetaBadges prompt={selected} />
              <div class="pl-run-meta">Updated {new Date(selected.updatedAt).toLocaleString()}</div>
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
