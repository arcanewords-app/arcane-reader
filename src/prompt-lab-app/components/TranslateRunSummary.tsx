import { useState } from 'preact/hooks';
import type { LabRunOutput } from '../api/client';
import { executionModeLabel } from '../../shared/translate-execution-modes.js';

interface TranslateRunSummaryProps {
  result: LabRunOutput;
  sourceLength: number;
}

export function TranslateRunSummary({ result, sourceLength }: TranslateRunSummaryProps) {
  const [showRaw, setShowRaw] = useState(false);
  const debug = result.translateDebug;
  if (!debug) return null;

  const outputLength = result.text?.length ?? 0;
  const ratio = sourceLength > 0 ? outputLength / sourceLength : 0;
  const chunkCount = debug.actualChunks ?? debug.chunkSummaries?.length ?? 0;
  const displayMode = debug.translateExecutionMode;
  const usedTextFallback = debug.chunkSummaries?.some((c) => c.completionPath === 'text');

  return (
    <div class="pl-translate-summary">
      <p class="pl-label">Translate summary</p>
      {usedTextFallback ? (
        <p class="pl-banner warn" role="status">
          Output recovered from text fallback — check paragraph alignment.
        </p>
      ) : null}
      <dl class="pl-exec-preview__dl">
        {displayMode ? (
          <>
            <dt>Execution</dt>
            <dd>{executionModeLabel(displayMode)}</dd>
          </>
        ) : null}
        {debug.chunkSizeTier ? (
          <>
            <dt>Tier</dt>
            <dd>{debug.chunkSizeTier}</dd>
          </>
        ) : null}
        {debug.chunkingMode ? (
          <>
            <dt>Chunking</dt>
            <dd>
              {debug.chunkingMode}
              {debug.chunkingReason ? ` (${debug.chunkingReason})` : ''}
            </dd>
          </>
        ) : null}
        <dt>Chunks run</dt>
        <dd>{chunkCount > 0 ? `${chunkCount}×` : '—'}</dd>
        {debug.chunkSummaries?.length ? (
          <>
            <dt>Completion paths</dt>
            <dd>{debug.chunkSummaries.map((c) => c.completionPath ?? '?').join(', ')}</dd>
          </>
        ) : null}
        <dt>Output / source</dt>
        <dd>
          {outputLength.toLocaleString()} / {sourceLength.toLocaleString()} chars
          {ratio > 0 ? ` (${ratio.toFixed(2)}×)` : ''}
        </dd>
      </dl>
      <button type="button" class="pl-btn pl-btn--ghost" onClick={() => setShowRaw((v) => !v)}>
        {showRaw ? 'Hide' : 'Show'} translate debug
      </button>
      {showRaw ? <pre class="pl-pre pl-pre--compact">{JSON.stringify(debug, null, 2)}</pre> : null}
    </div>
  );
}
