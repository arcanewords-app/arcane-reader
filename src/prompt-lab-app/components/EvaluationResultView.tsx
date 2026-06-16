import type { LabEvaluation } from '../api/client.js';

interface Props {
  evaluation: LabEvaluation | null;
  loading?: boolean;
  error?: string | null;
  model?: string;
  elapsedMs?: number;
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
  if (!evaluation) return <p class="pl-muted">Run evaluation to see score.</p>;

  const dims = evaluation.result.dimensions;

  return (
    <div class="pl-evaluation">
      <div class="pl-evaluation-score">
        <span class="pl-evaluation-score-value">{evaluation.score ?? evaluation.result.score}</span>
        <span class="pl-muted"> / 10</span>
      </div>
      {evaluation.result.summary ? (
        <p class="pl-evaluation-summary">{evaluation.result.summary}</p>
      ) : null}
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
      {evaluation.result.issues?.length ? (
        <div class="pl-evaluation-section">
          <h3 class="pl-label">Issues</h3>
          <ul class="pl-evaluation-list">
            {evaluation.result.issues.map((issue, i) => (
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
      {evaluation.result.suggestions?.length ? (
        <div class="pl-evaluation-section">
          <h3 class="pl-label">Suggestions</h3>
          <ul class="pl-evaluation-list">
            {evaluation.result.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p class="pl-muted pl-run-meta">
        {evaluation.model ?? 'model'} · {evaluation.tokensUsed} tok · {evaluation.durationMs} ms ·{' '}
        {new Date(evaluation.createdAt).toLocaleString()}
      </p>
    </div>
  );
}
