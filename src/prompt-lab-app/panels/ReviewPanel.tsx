import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { LabEvaluation, LabEvaluationPreview, LabMeta, LabRun } from '../api/client.js';
import {
  deleteEvaluation,
  evaluateRuns,
  fetchEvaluations,
  fetchRuns,
  formatRunDisplayName,
  previewEvaluation,
} from '../api/client.js';
import { ConfirmModal } from '../components/ConfirmModal.js';
import {
  EvaluationPromptModal,
  type EvaluationPromptTab,
} from '../components/EvaluationPromptModal.js';
import { EvaluationResultView } from '../components/EvaluationResultView.js';
import { PlParagraphCompareView } from '../components/PlParagraphCompareView.js';
import { PlChip } from '../components/PlChip.js';
import { PlCollapsible } from '../components/PlCollapsible.js';
import { PlSelect } from '../components/PlSelect.js';
import { RunMetaBadges } from '../components/RunMetaBadges.js';
import { modelsForStage } from '../../shared/llmModels.js';
import { resolveRunContent } from '../utils/paragraphs.js';

type CompareMode = 'source' | 'output';

const EVAL_MODEL_STORAGE_KEY = 'pl-review-eval-model';

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

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function formatEvalHistoryLabel(ev: LabEvaluation): string {
  const verdict = ev.result.verdict?.preferred_variant;
  if (verdict) {
    const label = verdict === 'TIE' ? 'TIE' : `Variant ${verdict}`;
    const justification = ev.result.verdict?.justification;
    return justification ? `${label} — ${truncate(justification, 80)}` : label;
  }
  if (ev.score != null || ev.result.score != null) {
    return `${ev.score ?? ev.result.score}/10`;
  }
  return 'Evaluation';
}

export function ReviewPanel({ active, meta }: Props) {
  const [runs, setRuns] = useState<LabRun[]>([]);
  const [leftRunId, setLeftRunId] = useState('');
  const [rightRunId, setRightRunId] = useState('');
  const [leftMode, setLeftMode] = useState<CompareMode>('output');
  const [rightMode, setRightMode] = useState<CompareMode>('output');
  const [sameSourceOnly, setSameSourceOnly] = useState(false);
  const [evalModel, setEvalModel] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [latestEval, setLatestEval] = useState<LabEvaluation | null>(null);
  const [history, setHistory] = useState<LabEvaluation[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [preview, setPreview] = useState<LabEvaluationPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [previewTab, setPreviewTab] = useState<EvaluationPromptTab>('system');
  const [deleteEvalId, setDeleteEvalId] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const evalModels = useMemo(() => modelsForStage('editing'), []);

  useEffect(() => {
    const stored = sessionStorage.getItem(EVAL_MODEL_STORAGE_KEY);
    if (stored) {
      setEvalModel(stored);
    } else if (meta?.defaultModel) {
      setEvalModel(meta.defaultModel);
    }
  }, [meta?.defaultModel]);

  const updateEvalModel = (value: string) => {
    setEvalModel(value);
    sessionStorage.setItem(EVAL_MODEL_STORAGE_KEY, value);
  };

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

  const handleLeftRunChange = (runId: string) => {
    setLeftRunId(runId);
    if (runId) setLeftMode('output');
  };

  const handleRightRunChange = (runId: string) => {
    setRightRunId(runId);
    if (runId) setRightMode('output');
  };

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

  // Invalidate stale prompt preview when selection changes.
  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
  }, [leftRunId, rightRunId, leftMode, rightMode]);

  const loadPreview = useCallback(async (): Promise<LabEvaluationPreview | null> => {
    if (!leftRun || !rightRun) return null;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const result = await previewEvaluation({
        leftRunId: leftRun.id,
        rightRunId: rightRun.id,
        leftMode,
        rightMode,
      });
      setPreview(result);
      return result;
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Preview failed');
      return null;
    } finally {
      setPreviewLoading(false);
    }
  }, [leftRun, rightRun, leftMode, rightMode]);

  const handleShowPrompt = async () => {
    setPromptModalOpen(true);
    if (!preview) await loadPreview();
  };

  useEffect(() => {
    if (evaluating) {
      const start = Date.now();
      setElapsedMs(0);
      timerRef.current = setInterval(() => setElapsedMs(Date.now() - start), 200);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [evaluating]);

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
        model: evalModel || meta?.defaultModel,
      });
      setLatestEval(evaluation);
    } catch (e) {
      setEvalError(e instanceof Error ? e.message : 'Evaluation failed');
    } finally {
      setEvaluating(false);
    }
  };

  const handleDeleteEval = async () => {
    if (!deleteEvalId) return;
    await deleteEvaluation(deleteEvalId);
    if (latestEval?.id === deleteEvalId) setLatestEval(null);
    setDeleteEvalId(null);
    await loadHistory();
  };

  const runOptions = filteredRuns.map((r) => ({
    value: r.id,
    label: formatRunDisplayName(r),
  }));

  const modelOptions = evalModels.map((m) => ({ value: m.value, label: m.label }));
  const pairReady = Boolean(leftRun && rightRun);
  const evalReady = pairReady && leftMode === 'output' && rightMode === 'output';
  const inlinePreviewText =
    previewTab === 'system' ? (preview?.systemPrompt ?? '') : (preview?.userPrompt ?? '');

  return (
    <div class="pl-review">
      <div class="pl-review-toolbar">
        <div class="pl-review-pickers">
          <div class="pl-review-picker">
            <PlSelect
              label="Left run"
              value={leftRunId}
              onChange={handleLeftRunChange}
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
              onChange={handleRightRunChange}
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

        <div class="pl-review-actions">
          <PlSelect
            label="Evaluation model"
            value={evalModel}
            onChange={updateEvalModel}
            options={modelOptions}
            hint="Reasoning models (gpt-5*, o1/o3/o4) may be slower but more thorough."
          />
          <label class="pl-checkbox-label">
            <input
              type="checkbox"
              checked={sameSourceOnly}
              onChange={(e) => setSameSourceOnly(e.currentTarget.checked)}
            />
            Same source only
          </label>
          <div class="pl-row">
            <button type="button" class="pl-btn secondary" onClick={() => void load()}>
              Refresh runs
            </button>
            <button
              type="button"
              class="pl-btn secondary"
              disabled={!evalReady}
              onClick={() => void handleShowPrompt()}
            >
              Evaluation prompt
            </button>
            <button
              type="button"
              class="pl-btn"
              disabled={!evalReady || evaluating}
              onClick={() => void handleEvaluate()}
            >
              {evaluating ? 'Evaluating…' : 'Evaluate'}
            </button>
          </div>
          {!evalReady && pairReady ? (
            <p class="pl-muted pl-eval-hint">
              Evaluation compares two translations (Output + Output) against the original source.
            </p>
          ) : null}
        </div>
      </div>

      {pairReady ? (
        <PlCollapsible title="Evaluation prompt preview">
          <div class="pl-row pl-eval-prompt-toolbar">
            <button
              type="button"
              class="pl-btn secondary pl-btn--sm"
              disabled={!evalReady}
              onClick={() => void loadPreview()}
            >
              {previewLoading ? 'Loading…' : preview ? 'Refresh preview' : 'Load preview'}
            </button>
            {preview ? (
              <button
                type="button"
                class="pl-btn secondary pl-btn--sm"
                onClick={() => setPromptModalOpen(true)}
              >
                View full prompt
              </button>
            ) : null}
            {preview ? <PlChip variant="model" label={preview.compareMode} /> : null}
          </div>
          {previewError ? <p class="pl-error">{previewError}</p> : null}
          {preview ? (
            <>
              <div class="pl-prompt-editor-tabs">
                <button
                  type="button"
                  class={`pl-tab-inline${previewTab === 'system' ? ' active' : ''}`}
                  onClick={() => setPreviewTab('system')}
                >
                  System
                </button>
                <button
                  type="button"
                  class={`pl-tab-inline${previewTab === 'user' ? ' active' : ''}`}
                  onClick={() => setPreviewTab('user')}
                >
                  User
                </button>
              </div>
              <textarea
                class="pl-textarea pl-textarea--compact"
                readOnly
                value={inlinePreviewText}
              />
            </>
          ) : !previewLoading ? (
            <p class="pl-muted">Load the prompt to see what is sent to the model.</p>
          ) : null}
        </PlCollapsible>
      ) : null}

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
        <EvaluationResultView
          evaluation={latestEval}
          loading={evaluating}
          error={evalError}
          model={evalModel || meta?.defaultModel}
          elapsedMs={elapsedMs}
        />
        <p class="pl-muted pl-eval-hint">
          Evaluation runs as a single LLM request (no chunking), so it finishes in seconds.
          Translation and edit stages process the full pipeline and may take minutes.
        </p>
      </section>

      {history.length > 0 ? (
        <section class="pl-section">
          <h2 class="pl-section-title">Saved evaluations</h2>
          <ul class="pl-list">
            {history.map((ev) => (
              <li key={ev.id} class="pl-list-item-with-action">
                <button
                  type="button"
                  class={`pl-list-btn${latestEval?.id === ev.id ? ' selected' : ''}`}
                  onClick={() => setLatestEval(ev)}
                >
                  <strong>{formatEvalHistoryLabel(ev)}</strong>
                  <span class="pl-muted">
                    {' '}
                    · {ev.model ?? 'model'} · {ev.tokensUsed} tok · {ev.durationMs} ms ·{' '}
                    {new Date(ev.createdAt).toLocaleString()}
                  </span>
                  {ev.result.verdict ? null : ev.result.summary ? (
                    <div class="pl-muted">{truncate(ev.result.summary, 120)}</div>
                  ) : null}
                </button>
                <button
                  type="button"
                  class="pl-btn danger pl-btn--sm"
                  onClick={() => setDeleteEvalId(ev.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <EvaluationPromptModal
        open={promptModalOpen}
        onClose={() => setPromptModalOpen(false)}
        preview={preview}
        loading={previewLoading}
        error={previewError}
      />

      <ConfirmModal
        open={Boolean(deleteEvalId)}
        title="Delete evaluation"
        message="Delete this saved evaluation from history?"
        confirmLabel="Delete"
        danger
        onConfirm={() => void handleDeleteEval()}
        onCancel={() => setDeleteEvalId(null)}
      />
    </div>
  );
}
