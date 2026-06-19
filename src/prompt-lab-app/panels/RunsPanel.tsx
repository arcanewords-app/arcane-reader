import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import type { LabRun } from '../api/client';
import { deleteRun, fetchRuns, formatRunDisplayName } from '../api/client';
import { AnalysisResultView } from '../components/AnalysisResultView';
import { ConfirmModal } from '../components/ConfirmModal';
import { PlCollapsible } from '../components/PlCollapsible';
import { RunGlossarySection } from '../components/RunGlossarySection';
import { RunMetaBadges } from '../components/RunMetaBadges';
import {
  DEFAULT_RUN_FILTERS,
  filterAndSortRuns,
  hasActiveRunFilters,
  uniqueRunLangPairs,
  uniqueRunModels,
  type RunListFilters,
} from '../utils/runFilters';
import { glossaryEntries } from '../utils/glossaryRunStatus';
import { formatDurationMs, formatTokenCount, STAGE_STRIPE_CLASS } from '../utils/visualTokens';

interface Props {
  active: boolean;
  onReplay: (run: LabRun) => void;
}

export function RunsPanel({ active, onReplay }: Props) {
  const [runs, setRuns] = useState<LabRun[]>([]);
  const [selected, setSelected] = useState<LabRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filters, setFilters] = useState<RunListFilters>(DEFAULT_RUN_FILTERS);

  const load = useCallback(async () => {
    try {
      const { runs: rows } = await fetchRuns(200);
      setRuns(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, []);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const modelOptions = useMemo(() => uniqueRunModels(runs), [runs]);
  const langPairOptions = useMemo(() => uniqueRunLangPairs(runs), [runs]);
  const filtered = useMemo(() => filterAndSortRuns(runs, filters), [runs, filters]);

  const setFilter = <K extends keyof RunListFilters>(key: K, value: RunListFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => setFilters(DEFAULT_RUN_FILTERS);

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteRun(deleteId);
    if (selected?.id === deleteId) setSelected(null);
    setDeleteId(null);
    await load();
  };

  return (
    <>
      <div class="pl-split">
        <div class="pl-pane">
          <div class="pl-filter-bar">
            <input
              class="pl-input pl-search-input"
              type="search"
              placeholder="Search runs…"
              value={filters.search}
              onInput={(e) => setFilter('search', e.currentTarget.value)}
            />
            <select
              class="pl-select"
              value={filters.stage}
              onChange={(e) => setFilter('stage', e.currentTarget.value as RunListFilters['stage'])}
            >
              <option value="">All stages</option>
              <option value="analyze">analyze</option>
              <option value="translate">translate</option>
              <option value="edit">edit</option>
            </select>
            <select
              class="pl-select"
              value={filters.model}
              onChange={(e) => setFilter('model', e.currentTarget.value)}
            >
              <option value="">All models</option>
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
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
            <select
              class="pl-select"
              value={filters.status}
              onChange={(e) =>
                setFilter('status', e.currentTarget.value as RunListFilters['status'])
              }
            >
              <option value="">All status</option>
              <option value="success">success</option>
              <option value="failed">failed</option>
            </select>
            <select
              class="pl-select"
              value={filters.glossary}
              onChange={(e) =>
                setFilter('glossary', e.currentTarget.value as RunListFilters['glossary'])
              }
            >
              <option value="">All glossary</option>
              <option value="on">with glossary</option>
              <option value="empty">glossary on (0)</option>
              <option value="off">glossary off</option>
              <option value="none">no glossary</option>
            </select>
            <select
              class="pl-select"
              value={filters.sort}
              onChange={(e) => setFilter('sort', e.currentTarget.value as RunListFilters['sort'])}
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="tokens">Most tokens</option>
              <option value="duration">Longest</option>
            </select>
            <button type="button" class="pl-btn secondary" onClick={() => void load()}>
              Refresh
            </button>
          </div>
          <p class="pl-filter-count">
            {filtered.length} shown · {runs.length} total
          </p>
          {error ? <p class="pl-error">{error}</p> : null}
          <ul class="pl-list">
            {filtered.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  class={`pl-list-btn pl-run-card ${STAGE_STRIPE_CLASS[r.stage]}${selected?.id === r.id ? ' selected' : ''}`}
                  onClick={() => setSelected(r)}
                >
                  <strong class="pl-run-card__title">{formatRunDisplayName(r)}</strong>
                  <RunMetaBadges run={r} />
                  <div class="pl-run-card__meta">
                    {new Date(r.createdAt).toLocaleString()} · {formatTokenCount(r.tokensUsed)} tok
                    · {formatDurationMs(r.durationMs)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {!filtered.length && !error && runs.length > 0 && hasActiveRunFilters(filters) ? (
            <div class="pl-filter-empty">
              <p>No runs match filters.</p>
              <button type="button" class="pl-btn secondary" onClick={clearFilters}>
                Clear filters
              </button>
            </div>
          ) : null}
          {!runs.length && !error ? <p class="pl-muted">No runs yet.</p> : null}
        </div>
        <div class="pl-pane">
          {selected ? (
            <>
              <RunMetaBadges run={selected} />
              <div class="pl-run-meta">
                {new Date(selected.createdAt).toLocaleString()} ·{' '}
                {formatTokenCount(selected.tokensUsed)} tok ·{' '}
                {formatDurationMs(selected.durationMs)}
              </div>
              {!selected.output.success && selected.output.error ? (
                <div class="pl-banner error" role="alert">
                  {selected.output.error}
                </div>
              ) : null}
              <div class="pl-row">
                <button type="button" class="pl-btn" onClick={() => onReplay(selected)}>
                  Replay in workbench
                </button>
                <a
                  class="pl-btn secondary"
                  href={`/api/prompt-lab/runs/${selected.id}/export`}
                  download
                >
                  Export JSON
                </a>
                <button
                  type="button"
                  class="pl-btn danger"
                  onClick={() => setDeleteId(selected.id)}
                >
                  Delete
                </button>
              </div>
              <PlCollapsible title="Raw params">
                <pre style={{ overflow: 'auto', fontSize: '12px', margin: 0 }}>
                  {JSON.stringify(selected.params, null, 2)}
                </pre>
              </PlCollapsible>
              <PlCollapsible title="Glossary">
                <RunGlossarySection
                  entries={glossaryEntries(selected)}
                  includeGlossary={selected.params.includeGlossary !== false}
                />
              </PlCollapsible>
              {selected.output.stage === 'analyze' && selected.output.analysis ? (
                <AnalysisResultView analysis={selected.output.analysis} />
              ) : (
                <textarea class="pl-textarea" readOnly value={selected.output.text ?? ''} />
              )}
            </>
          ) : (
            <p class="pl-muted">Select a run to view details.</p>
          )}
        </div>
      </div>

      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete run"
        message="Delete this run from history?"
        confirmLabel="Delete"
        danger
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </>
  );
}
