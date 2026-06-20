import { useState } from 'preact/hooks';
import type { LabRunOutput } from '../api/client';
import { editPresetLabel } from '../../shared/edit-quality-presets.js';
import { EDIT_FOCUS_LABELS, EDIT_STYLE_LABELS } from '../../shared/editing-labels.js';

interface EditRunSummaryProps {
  result: LabRunOutput;
  draftLength: number;
}

export function EditRunSummary({ result, draftLength }: EditRunSummaryProps) {
  const [showRaw, setShowRaw] = useState(false);
  const debug = result.editDebug;
  if (!debug) return null;

  const outputLength = result.text?.length ?? debug.outputLength ?? 0;
  const ratio = draftLength > 0 ? outputLength / draftLength : 0;
  const displayPreset = debug.editQualityPreset;

  return (
    <div class="pl-translate-summary">
      <p class="pl-label">Edit summary</p>
      <dl class="pl-exec-preview__dl">
        {displayPreset ? (
          <>
            <dt>Preset</dt>
            <dd>{editPresetLabel(displayPreset)}</dd>
          </>
        ) : null}
        <dt>Style / Focus</dt>
        <dd>
          {EDIT_STYLE_LABELS[debug.editingStylePreset] ?? debug.editingStylePreset} /{' '}
          {EDIT_FOCUS_LABELS[debug.editingFocus] ?? debug.editingFocus}
        </dd>
        <dt>Chunking</dt>
        <dd>
          {debug.chunkingMode}
          {debug.chunkingReason ? ` (${debug.chunkingReason})` : ''}
        </dd>
        <dt>Chunks</dt>
        <dd>{debug.estimatedChunks > 0 ? `${debug.estimatedChunks}×` : '—'}</dd>
        <dt>Output / draft</dt>
        <dd>
          {outputLength.toLocaleString()} / {draftLength.toLocaleString()} chars
          {ratio > 0 ? ` (${ratio.toFixed(2)}×)` : ''}
        </dd>
      </dl>
      {ratio > 1.5 ? (
        <p class="pl-hint pl-hint--block">
          Output is {ratio.toFixed(1)}× longer than draft — check for unexpected expansion.
        </p>
      ) : null}
      <label class="pl-checkbox-label">
        <input
          type="checkbox"
          checked={showRaw}
          onChange={(e) => setShowRaw(e.currentTarget.checked)}
        />
        Show raw debug JSON
      </label>
      {showRaw ? <pre class="pl-api-params">{JSON.stringify(debug, null, 2)}</pre> : null}
    </div>
  );
}
