import { useState } from 'preact/hooks';
import type { LabRunOutput } from '../api/client';
import { editExecutionModeLabel } from '../../shared/edit-execution-modes.js';
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
  const displayMode = debug.editExecutionMode;
  const chunkCount = debug.actualChunks ?? debug.estimatedChunks;

  return (
    <div class="pl-translate-summary">
      <p class="pl-label">Edit summary</p>
      <dl class="pl-exec-preview__dl">
        {displayMode ? (
          <>
            <dt>Execution</dt>
            <dd>{editExecutionModeLabel(displayMode)}</dd>
          </>
        ) : null}
        {debug.chunkSizeTier ? (
          <>
            <dt>Tier</dt>
            <dd>{debug.chunkSizeTier}</dd>
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
        <dd>{chunkCount > 0 ? `${chunkCount}×` : '—'}</dd>
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
      <button type="button" class="pl-btn pl-btn--ghost" onClick={() => setShowRaw((v) => !v)}>
        {showRaw ? 'Hide' : 'Show'} edit debug
      </button>
      {showRaw ? <pre class="pl-pre pl-pre--compact">{JSON.stringify(debug, null, 2)}</pre> : null}
    </div>
  );
}
