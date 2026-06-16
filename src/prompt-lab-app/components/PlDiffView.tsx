import { computeLineDiff } from '../utils/diff';

interface PlDiffViewProps {
  baseline: string;
  current: string;
}

export function PlDiffView({ baseline, current }: PlDiffViewProps) {
  const lines = computeLineDiff(baseline, current);
  const hasChanges = lines.some((l) => l.type !== 'same');

  if (!hasChanges) {
    return <p class="pl-muted">No differences from baseline.</p>;
  }

  return (
    <pre class="pl-diff" aria-label="Prompt diff">
      {lines.map((line, i) => (
        <div key={i} class={`pl-diff-line pl-diff-line--${line.type}`}>
          <span class="pl-diff-prefix">
            {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
          </span>
          {line.text}
        </div>
      ))}
    </pre>
  );
}
