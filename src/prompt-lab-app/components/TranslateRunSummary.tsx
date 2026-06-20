import { useState } from 'preact/hooks';
import type { LabRunOutput } from '../api/client';
import { presetLabel } from '../../shared/translate-quality-presets.js';

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
  const chunkCount = debug.chunkSummaries?.length ?? 0;
  const displayPreset = debug.translateQualityPreset;

  return (
    <div class="pl-translate-summary">
      <p class="pl-label">Translate summary</p>
      <dl class="pl-exec-preview__dl">
        {displayPreset ? (
          <>
            <dt>Preset</dt>
            <dd>{presetLabel(displayPreset)}</dd>
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
      {ratio > 2.5 ? (
        <p class="pl-error pl-hint--block">
          Output is {ratio.toFixed(1)}× longer than source — check for merge bloat or retry with
          Enhanced single-shot.
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
