import type { TranslateExecutionPreview } from '@engine/translate-execution-preview.js';
import { TRANSLATE_QUALITY_PRESETS } from '../../shared/translate-quality-presets.js';

interface TranslateExecutionPreviewCardProps {
  preview: TranslateExecutionPreview | null;
}

export function TranslateExecutionPreviewCard({ preview }: TranslateExecutionPreviewCardProps) {
  if (!preview) {
    return <p class="pl-muted">Add source text to see execution plan.</p>;
  }

  const presetMeta = TRANSLATE_QUALITY_PRESETS.find((p) => p.value === preview.preset);
  const modeLabel =
    preview.chunkingMode === 'single_shot'
      ? 'Single request (1 API call)'
      : `~${preview.estimatedChunks} chunks (sequential)`;

  return (
    <div class="pl-exec-preview">
      <p class="pl-exec-preview__title">Execution plan</p>
      <dl class="pl-exec-preview__dl">
        <dt>Mode</dt>
        <dd>{modeLabel}</dd>
        <dt>Preset</dt>
        <dd>
          {presetMeta?.label ?? preview.preset} — {presetMeta?.description}
        </dd>
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
