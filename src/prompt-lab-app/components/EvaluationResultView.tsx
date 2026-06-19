import { useState } from 'preact/hooks';
import type { LabEvaluation, LabEvaluationResult, VariantEvaluation } from '../api/client.js';
import { PlCollapsible } from './PlCollapsible.js';

interface Props {
  evaluation: LabEvaluation | null;
  loading?: boolean;
  error?: string | null;
  model?: string;
  elapsedMs?: number;
}

function isLegacyResult(result: LabEvaluationResult): boolean {
  return !result.verdict && (result.score != null || Boolean(result.summary));
}

function VariantIssues({ variant, label }: { variant: VariantEvaluation; label: string }) {
  return (
    <PlCollapsible title={label} defaultOpen>
      {variant.strengths ? (
        <p class="pl-evaluation-strengths">
          <strong>Strengths:</strong> {variant.strengths}
        </p>
      ) : null}
      {variant.issues.length ? (
        <ul class="pl-evaluation-list">
          {variant.issues.map((issue, i) => (
            <li key={i}>
              {issue.paragraphIndex != null ? (
                <span class="pl-muted">¶{issue.paragraphIndex + 1}: </span>
              ) : null}
              <span class="pl-muted">{issue.dimension} · </span>
              <span class={`pl-badge ${issue.severity}`}>{issue.severity} </span>
              {issue.description}
            </li>
          ))}
        </ul>
      ) : (
        <p class="pl-muted">No issues reported.</p>
      )}
    </PlCollapsible>
  );
}

function LegacyEvaluationView({ result }: { result: LabEvaluationResult }) {
  const dims = result.dimensions;
  return (
    <>
      {result.score != null ? (
        <div class="pl-evaluation-score">
          <span class="pl-evaluation-score-value">{result.score}</span>
          <span class="pl-muted"> / 10</span>
        </div>
      ) : null}
      {result.summary ? <p class="pl-evaluation-summary">{result.summary}</p> : null}
      {dims ? (
        <dl class="pl-evaluation-dims">
          {(['accuracy', 'fluency', 'glossary', 'style'] as const).map((key) =>
            dims[key] != null ? (
              <div class="pl-evaluation-dim" key={key}>
                <dt>{key}</dt>
                <dd>{dims[key]}</dd>
              </div>
            ) : null
          )}
        </dl>
      ) : null}
      {result.issues?.length ? (
        <div class="pl-evaluation-section">
          <h3 class="pl-label">Issues</h3>
          <ul class="pl-evaluation-list">
            {result.issues.map((issue, i) => (
              <li key={i}>
                {issue.paragraphIndex != null ? (
                  <span class="pl-muted">¶{issue.paragraphIndex + 1}: </span>
                ) : null}
                {issue.severity ? (
                  <span class={`pl-badge ${issue.severity}`}>{issue.severity} </span>
                ) : null}
                {issue.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {result.suggestions?.length ? (
        <div class="pl-evaluation-section">
          <h3 class="pl-label">Suggestions</h3>
          <ul class="pl-evaluation-list">
            {result.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

function MqmEvaluationView({ result }: { result: LabEvaluationResult }) {
  const [copied, setCopied] = useState(false);
  const verdict = result.verdict!;
  const polished = verdict.final_polished_version ?? '';

  const handleCopy = async () => {
    if (!polished) return;
    try {
      await navigator.clipboard.writeText(polished);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <div class="pl-evaluation-verdict">
        <span
          class={`pl-verdict-badge pl-verdict-badge--${verdict.preferred_variant.toLowerCase()}`}
        >
          {verdict.preferred_variant === 'TIE' ? 'TIE' : `Variant ${verdict.preferred_variant}`}
        </span>
        {verdict.justification ? (
          <p class="pl-evaluation-summary">{verdict.justification}</p>
        ) : null}
      </div>

      {result.variant_A ? <VariantIssues variant={result.variant_A} label="Variant A" /> : null}
      {result.variant_B ? <VariantIssues variant={result.variant_B} label="Variant B" /> : null}

      {polished ? (
        <div class="pl-evaluation-section">
          <div class="pl-evaluation-polished-header">
            <h3 class="pl-label">Final polished version</h3>
            <button
              type="button"
              class="pl-btn secondary pl-btn--sm"
              onClick={() => void handleCopy()}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <textarea class="pl-textarea pl-textarea--compact" readOnly value={polished} />
        </div>
      ) : null}

      {result.analysis_scratchpad ? (
        <PlCollapsible title="Analysis scratchpad">
          <pre class="pl-evaluation-scratchpad">{result.analysis_scratchpad}</pre>
        </PlCollapsible>
      ) : null}
    </>
  );
}

export function EvaluationResultView({ evaluation, loading, error, model, elapsedMs }: Props) {
  if (loading) {
    const seconds = elapsedMs != null ? Math.floor(elapsedMs / 1000) : null;
    return (
      <p class="pl-muted">
        Evaluating{model ? ` with ${model}` : ''}…{seconds != null ? ` (${seconds}s)` : ''}
      </p>
    );
  }
  if (error) return <p class="pl-error">{error}</p>;
  if (!evaluation) return <p class="pl-muted">Run evaluation to see results.</p>;

  const { result } = evaluation;

  return (
    <div class="pl-evaluation">
      {isLegacyResult(result) ? (
        <LegacyEvaluationView result={result} />
      ) : result.verdict ? (
        <MqmEvaluationView result={result} />
      ) : (
        <p class="pl-muted">Evaluation completed but no structured result was returned.</p>
      )}
      <p class="pl-muted pl-run-meta">
        {evaluation.model ?? 'model'} · {evaluation.tokensUsed} tok · {evaluation.durationMs} ms ·{' '}
        {new Date(evaluation.createdAt).toLocaleString()}
      </p>
    </div>
  );
}
