import type { EditExecutionPreview } from '@engine/edit-execution-preview.js';
import { EDIT_QUALITY_PRESETS } from '../../shared/edit-quality-presets.js';

interface EditExecutionPreviewCardProps {
  preview: EditExecutionPreview | null;
}

export function EditExecutionPreviewCard({ preview }: EditExecutionPreviewCardProps) {
  if (!preview) {
    return <p class="pl-muted">Add draft text to see execution plan.</p>;
  }

  const presetMeta = EDIT_QUALITY_PRESETS.find((p) => p.value === preview.preset);
  const modeLabel =
    preview.chunkingMode === 'single_shot'
      ? 'Single request (1 API call)'
      : `~${preview.estimatedChunks} chunks (parallel)`;

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
        <dt>Style / Focus</dt>
        <dd>
          {preview.editingStylePreset} / {preview.editingFocus}
        </dd>
        {preview.chunkingMode === 'chunked' ? (
          <>
            <dt>Chunk size</dt>
            <dd>{preview.effectiveChunkSize} tokens</dd>
          </>
        ) : null}
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
