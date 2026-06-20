import type { TranslateExecutionPreview } from '@engine/translate-execution-preview.js';
import { TRANSLATE_EXECUTION_MODES } from '../../shared/translate-execution-modes.js';

interface TranslateExecutionPreviewCardProps {
  preview: TranslateExecutionPreview | null;
  actualChunks?: number;
}

function modeLabel(preview: TranslateExecutionPreview): string {
  if (preview.chunkingMode === 'single_shot') {
    return 'Single request (1 API call)';
  }
  const tierPrefix =
    preview.chunkSizeTier === 'large' ? 'large' : preview.chunkSizeTier === 'standard' ? '' : '';
  const sizeNote = tierPrefix ? `${tierPrefix} ` : '';
  return `~${preview.estimatedChunks} ${sizeNote}chunks (${preview.effectiveChunkSize} tok, sequential)`;
}

export function TranslateExecutionPreviewCard({
  preview,
  actualChunks,
}: TranslateExecutionPreviewCardProps) {
  if (!preview) {
    return <p class="pl-muted">Add source text to see execution plan.</p>;
  }

  const modeMeta = TRANSLATE_EXECUTION_MODES.find((p) => p.value === preview.executionMode);
  const plannedLabel = modeLabel(preview);
  const showActualMismatch =
    actualChunks != null && actualChunks > 0 && actualChunks !== preview.estimatedChunks;

  return (
    <div class="pl-exec-preview">
      <p class="pl-exec-preview__title">Execution plan</p>
      <dl class="pl-exec-preview__dl">
        <dt>Mode</dt>
        <dd>
          {plannedLabel}
          {showActualMismatch ? (
            <span class="pl-muted"> (actual: {actualChunks} chunks)</span>
          ) : null}
        </dd>
        <dt>Execution</dt>
        <dd>
          {modeMeta?.label ?? preview.executionMode} — {modeMeta?.description}
        </dd>
        <dt>Tier</dt>
        <dd>{preview.chunkSizeTier}</dd>
        {preview.chunkingMode === 'chunked' ? (
          <>
            <dt>Chunk size</dt>
            <dd>{preview.effectiveChunkSize} tokens</dd>
          </>
        ) : null}
        <dt>CoT / Few-shot</dt>
        <dd>
          {preview.flags.enableCoT ? 'on' : 'off'} / {preview.flags.enableFewShot ? 'on' : 'off'}
        </dd>
        <dt>Leading context</dt>
        <dd>
          {preview.chunkingMode === 'single_shot'
            ? 'n/a (full chapter)'
            : preview.flags.leadingContextParagraphs > 0
              ? `${preview.flags.leadingContextParagraphs} paragraphs`
              : 'off'}
        </dd>
        <dt>Est. tokens</dt>
        <dd>
          ~{preview.estimatedInputTokens.toLocaleString()} in / ~
          {preview.estimatedOutputTokens.toLocaleString()} out · max output{' '}
          {preview.effectiveMaxTokens.toLocaleString()}
        </dd>
      </dl>
      {preview.hints.map((hint) => (
        <p class="pl-hint pl-hint--block" key={hint}>
          {hint}
        </p>
      ))}
    </div>
  );
}
