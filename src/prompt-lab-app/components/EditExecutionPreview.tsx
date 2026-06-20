import type { EditExecutionPreview } from '@engine/edit-execution-preview.js';
import { EDIT_QUALITY_PRESETS } from '../../shared/edit-quality-presets.js';
import { EDIT_FOCUS_LABELS, EDIT_STYLE_LABELS } from '../../shared/editing-labels.js';

interface EditExecutionPreviewCardProps {
  preview: EditExecutionPreview | null;
}

export function EditExecutionPreviewCard({ preview }: EditExecutionPreviewCardProps) {
  if (!preview) {
    return null;
  }

  const presetMeta = EDIT_QUALITY_PRESETS.find((p) => p.value === preview.preset);
  const modeLabel =
    preview.chunkingMode === 'single_shot'
      ? 'Single request (1 API call)'
      : preview.hasDraftText
        ? `~${preview.estimatedChunks} chunks (parallel)`
        : 'Chunked (parallel)';

  const styleLabel = EDIT_STYLE_LABELS[preview.editingStylePreset] ?? preview.editingStylePreset;
  const focusLabel = EDIT_FOCUS_LABELS[preview.editingFocus] ?? preview.editingFocus;

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
          {styleLabel} / {focusLabel}
        </dd>
        {preview.chunkingMode === 'chunked' ? (
          <>
            <dt>Chunk size</dt>
            <dd>{preview.effectiveChunkSize} tokens</dd>
          </>
        ) : null}
        <dt>Est. tokens</dt>
        <dd>
          {preview.hasDraftText ? (
            <>
              ~{preview.estimatedInputTokens.toLocaleString()} in / ~
              {preview.estimatedOutputTokens.toLocaleString()} out · max output{' '}
              {preview.effectiveMaxTokens.toLocaleString()}
            </>
          ) : (
            'Add draft for estimates'
          )}
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
