import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import type { LabStage, LabText } from '../api/client';
import { deleteText, fetchTexts } from '../api/client';
import { ConfirmModal } from '../components/ConfirmModal';
import { PlChip } from '../components/PlChip';
import { PlCollapsible } from '../components/PlCollapsible';
import { PlParagraphPreview } from '../components/PlParagraphPreview';
import { langPairLabel } from '../utils/visualTokens';

interface Props {
  active: boolean;
  onLoad: (text: LabText) => void;
}

export function TextsPanel({ active, onLoad }: Props) {
  const [texts, setTexts] = useState<LabText[]>([]);
  const [selected, setSelected] = useState<LabText | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<LabStage | ''>('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { texts: rows } = await fetchTexts();
      setTexts(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, []);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return texts.filter((t) => {
      if (stageFilter && t.stageHint !== stageFilter) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.content.toLowerCase().includes(q) ||
        `${t.sourceLanguage}-${t.targetLanguage}`.includes(q)
      );
    });
  }, [texts, search, stageFilter]);

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteText(deleteId);
    if (selected?.id === deleteId) setSelected(null);
    setDeleteId(null);
    await load();
  };

  return (
    <>
      <div class="pl-split">
        <div class="pl-pane">
          <div class="pl-toolbar">
            <input
              class="pl-input pl-search-input"
              type="search"
              placeholder="Search texts…"
              value={search}
              onInput={(e) => setSearch(e.currentTarget.value)}
            />
            <select
              class="pl-select"
              value={stageFilter}
              onChange={(e) => setStageFilter(e.currentTarget.value as LabStage | '')}
            >
              <option value="">All stages</option>
              <option value="analyze">analyze</option>
              <option value="translate">translate</option>
              <option value="edit">edit</option>
            </select>
            <button type="button" class="pl-btn secondary" onClick={() => void load()}>
              Refresh
            </button>
          </div>
          {error ? <p class="pl-error">{error}</p> : null}
          <ul class="pl-list">
            {filtered.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  class={`pl-list-btn${selected?.id === t.id ? ' selected' : ''}`}
                  onClick={() => setSelected(t)}
                >
                  <strong>{t.title}</strong>
                  <div class="pl-chip-row" style={{ marginTop: '4px' }}>
                    <PlChip
                      variant="lang"
                      label={langPairLabel(t.sourceLanguage, t.targetLanguage)}
                    />
                    {t.stageHint ? (
                      <PlChip variant="stage" stage={t.stageHint as LabStage} label={t.stageHint} />
                    ) : null}
                  </div>
                  <div class="pl-muted">{t.content.slice(0, 120)}…</div>
                </button>
              </li>
            ))}
          </ul>
          {!filtered.length && !error ? <p class="pl-muted">No saved texts yet.</p> : null}
        </div>
        <div class="pl-pane">
          {selected ? (
            <>
              <div class="pl-row">
                <button type="button" class="pl-btn" onClick={() => onLoad(selected)}>
                  Load in workbench
                </button>
                <button
                  type="button"
                  class="pl-btn danger"
                  onClick={() => setDeleteId(selected.id)}
                >
                  Delete
                </button>
              </div>
              <p class="pl-muted">
                {selected.sourceLanguage}→{selected.targetLanguage}
                {selected.stageHint ? ` · ${selected.stageHint}` : ''}
              </p>
              <PlParagraphPreview text={selected.content} label="Source paragraphs" />
              <PlCollapsible title="Raw source">
                <textarea
                  class="pl-textarea pl-textarea--compact"
                  readOnly
                  value={selected.content}
                />
              </PlCollapsible>
              {selected.translatedText ? (
                <>
                  <PlParagraphPreview
                    text={selected.translatedText}
                    label="Translated paragraphs"
                  />
                  <PlCollapsible title="Raw translated">
                    <textarea
                      class="pl-textarea pl-textarea--compact"
                      readOnly
                      value={selected.translatedText}
                    />
                  </PlCollapsible>
                </>
              ) : null}
            </>
          ) : (
            <p class="pl-muted">Select a saved text to preview.</p>
          )}
        </div>
      </div>

      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete text"
        message="Delete this saved text?"
        confirmLabel="Delete"
        danger
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </>
  );
}
