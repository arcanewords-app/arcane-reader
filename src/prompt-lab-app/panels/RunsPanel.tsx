import { useCallback, useEffect, useState } from 'preact/hooks';
import type { LabRun } from '../api/client';
import { deleteRun, fetchRuns } from '../api/client';
import { AnalysisResultView } from '../components/AnalysisResultView';
import { ConfirmModal } from '../components/ConfirmModal';

interface Props {
  active: boolean;
  onReplay: (run: LabRun) => void;
}

export function RunsPanel({ active, onReplay }: Props) {
  const [runs, setRuns] = useState<LabRun[]>([]);
  const [selected, setSelected] = useState<LabRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { runs: rows } = await fetchRuns();
      setRuns(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, []);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteRun(deleteId);
    if (selected?.id === deleteId) setSelected(null);
    setDeleteId(null);
    await load();
  };

  const formatRunSummary = (r: LabRun) => {
    const model = typeof r.params.model === 'string' ? r.params.model : 'default';
    const temp = typeof r.params.temperature === 'number' ? r.params.temperature : '—';
    return `${r.params.sourceLanguage as string}→${r.params.targetLanguage as string} · ${model} · temp ${temp}`;
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
            {runs.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  class={`pl-list-btn${selected?.id === r.id ? ' selected' : ''}`}
                  onClick={() => setSelected(r)}
                >
                  <strong>{r.stage}</strong>
                  <span class="pl-muted"> {formatRunSummary(r)}</span>
                  <div class="pl-muted">
                    {new Date(r.createdAt).toLocaleString()} — {r.tokensUsed} tok · {r.durationMs}{' '}
                    ms
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {!runs.length && !error ? <p class="pl-muted">No runs yet.</p> : null}
        </div>
        <div class="pl-pane">
          {selected ? (
            <>
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
              <pre style={{ overflow: 'auto', fontSize: '12px' }}>
                {JSON.stringify(selected.params, null, 2)}
              </pre>
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
