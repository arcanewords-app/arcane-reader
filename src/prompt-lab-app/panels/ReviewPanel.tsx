import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import type { LabEvaluation, LabMeta, LabRun } from '../api/client.js';
import { evaluateRuns, fetchEvaluations, fetchRuns, formatRunDisplayName } from '../api/client.js';
import { EvaluationResultView } from '../components/EvaluationResultView.js';
import { PlParagraphCompareView } from '../components/PlParagraphCompareView.js';
import { PlChip } from '../components/PlChip.js';
import { PlSelect } from '../components/PlSelect.js';
import { RunMetaBadges } from '../components/RunMetaBadges.js';
import { resolveRunContent } from '../utils/paragraphs.js';

type CompareMode = 'source' | 'output';

interface Props {
  active: boolean;
  meta: LabMeta | null;
}

function isReviewableRun(run: LabRun): boolean {
  if (run.stage !== 'translate' && run.stage !== 'edit') return false;
  if (!run.output.success) return false;
  const text = run.output.text ?? run.inputSnapshot.translatedText;
  return Boolean(text?.trim());
}

export function ReviewPanel({ active, meta }: Props) {
  const [runs, setRuns] = useState<LabRun[]>([]);
  const [leftRunId, setLeftRunId] = useState('');
  const [rightRunId, setRightRunId] = useState('');
  const [leftMode, setLeftMode] = useState<CompareMode>('source');
  const [rightMode, setRightMode] = useState<CompareMode>('output');
  const [sameSourceOnly, setSameSourceOnly] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [latestEval, setLatestEval] = useState<LabEvaluation | null>(null);
  const [history, setHistory] = useState<LabEvaluation[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { runs: rows } = await fetchRuns(200);
      setRuns(rows.filter(isReviewableRun));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load runs');
    }
  }, []);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const leftRun = runs.find((r) => r.id === leftRunId) ?? null;
  const rightRun = runs.find((r) => r.id === rightRunId) ?? null;

  const filteredRuns = useMemo(() => {
    if (!sameSourceOnly || !leftRun) return runs;
    const src = leftRun.inputSnapshot.sourceText;
    return runs.filter((r) => r.inputSnapshot.sourceText === src);
  }, [runs, sameSourceOnly, leftRun]);

  const leftText = leftRun ? resolveRunContent(leftRun, leftMode) : '';
  const rightText = rightRun ? resolveRunContent(rightRun, rightMode) : '';

  const loadHistory = useCallback(async () => {
    if (!rightRunId && !leftRunId) {
      setHistory([]);
      return;
    }
    const runId = rightRunId || leftRunId;
    try {
      const { evaluations } = await fetchEvaluations(runId);
      setHistory(evaluations);
    } catch {
      setHistory([]);
    }
  }, [leftRunId, rightRunId]);

  useEffect(() => {
    if (active) void loadHistory();
  }, [active, loadHistory, latestEval]);

  const handleEvaluate = async () => {
    if (!leftRun || !rightRun) return;
    setEvaluating(true);
    setEvalError(null);
    try {
      const evaluation = await evaluateRuns({
        leftRunId: leftRun.id,
        rightRunId: rightRun.id,
        leftMode,
        rightMode,
        model: meta?.defaultModel,
      });
      setLatestEval(evaluation);
    } catch (e) {
      setEvalError(e instanceof Error ? e.message : 'Evaluation failed');
    } finally {
      setEvaluating(false);
    }
  };

  const runOptions = filteredRuns.map((r) => ({
    value: r.id,
    label: formatRunDisplayName(r),
  }));

  return (
    <div class="pl-review">
      <div class="pl-review-toolbar">
        <div class="pl-review-pickers">
          <div class="pl-review-picker">
            <PlSelect
              label="Left run"
              value={leftRunId}
              onChange={(v) => setLeftRunId(v)}
              options={[{ value: '', label: '— select —' }, ...runOptions]}
            />
            <PlSelect
              label="Left content"
              value={leftMode}
              onChange={(v) => setLeftMode(v as CompareMode)}
              options={[
                { value: 'source', label: 'Source' },
                { value: 'output', label: 'Output' },
              ]}
            />
            {leftRun ? <RunMetaBadges run={leftRun} hideStatus /> : null}
          </div>
          <div class="pl-review-picker">
            <PlSelect
              label="Right run"
              value={rightRunId}
              onChange={(v) => setRightRunId(v)}
              options={[{ value: '', label: '— select —' }, ...runOptions]}
            />
            <PlSelect
              label="Right content"
              value={rightMode}
              onChange={(v) => setRightMode(v as CompareMode)}
              options={[
                { value: 'source', label: 'Source' },
                { value: 'output', label: 'Output' },
              ]}
            />
            {rightRun ? <RunMetaBadges run={rightRun} hideStatus /> : null}
          </div>
        </div>
        <div class="pl-row">
          <label class="pl-checkbox-label">
            <input
              type="checkbox"
              checked={sameSourceOnly}
              onChange={(e) => setSameSourceOnly(e.currentTarget.checked)}
            />
            Same source only
          </label>
          <button type="button" class="pl-btn secondary" onClick={() => void load()}>
            Refresh runs
          </button>
          <button
            type="button"
            class="pl-btn"
            disabled={!leftRun || !rightRun || evaluating}
            onClick={() => void handleEvaluate()}
          >
            {evaluating ? 'Evaluating…' : 'Evaluate'}
          </button>
        </div>
      </div>

      {loadError ? <p class="pl-error">{loadError}</p> : null}

      <PlParagraphCompareView
        leftText={leftText}
        rightText={rightText}
        leftLabel={leftRun ? formatRunDisplayName(leftRun) : 'Left'}
        rightLabel={rightRun ? formatRunDisplayName(rightRun) : 'Right'}
        leftSubtitle={
          leftRun ? (
            <>
              <RunMetaBadges run={leftRun} hideStatus />
              <PlChip variant="neutral" label={leftMode} />
            </>
          ) : undefined
        }
        rightSubtitle={
          rightRun ? (
            <>
              <RunMetaBadges run={rightRun} hideStatus />
              <PlChip variant="neutral" label={rightMode} />
            </>
          ) : undefined
        }
      />

      <section class="pl-section">
        <h2 class="pl-section-title">Evaluation</h2>
        <EvaluationResultView evaluation={latestEval} loading={evaluating} error={evalError} />
      </section>

      {history.length > 0 ? (
        <section class="pl-section">
          <h2 class="pl-section-title">Saved evaluations</h2>
          <ul class="pl-list">
            {history.map((ev) => (
              <li key={ev.id}>
                <button
                  type="button"
                  class={`pl-list-btn${latestEval?.id === ev.id ? ' selected' : ''}`}
                  onClick={() => setLatestEval(ev)}
                >
                  <strong>{ev.score ?? ev.result.score}/10</strong>
                  <span class="pl-muted"> · {new Date(ev.createdAt).toLocaleString()}</span>
                  {ev.result.summary ? (
                    <div class="pl-muted">{ev.result.summary.slice(0, 120)}…</div>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
