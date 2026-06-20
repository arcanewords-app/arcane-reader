import type { LabLanguage, LabRun } from '../api/client';
import { PlChip } from './PlChip';
import { langPairLabel, modelChipStyle, modelLabel } from '../utils/visualTokens';
import {
  glossaryRunLabel,
  glossaryRunStatus,
  glossaryRunTitle,
  glossarySnapshotCount,
} from '../utils/glossaryRunStatus';
import {
  inferPresetFromLegacyParams,
  presetLabel,
  type TranslateQualityPreset,
} from '../../shared/translate-quality-presets.js';
import {
  inferEditPresetFromLegacyParams,
  editPresetLabel,
  type EditQualityPreset,
} from '../../shared/edit-quality-presets.js';
import { normalizeEditingFocus } from '../../shared/editing-focus.js';

interface RunMetaBadgesProps {
  run: LabRun;
  /** Hide status chip (e.g. when only showing successful runs). */
  hideStatus?: boolean;
}

function runModel(run: LabRun): string {
  return typeof run.params.model === 'string' ? run.params.model : 'default';
}

function runTemp(run: LabRun): string | null {
  const t = run.params.temperature;
  if (typeof t !== 'number') return null;
  return `temp ${t}`;
}

function runLabel(run: LabRun): string | null {
  const label = run.params.runLabel;
  return typeof label === 'string' && label.trim() ? label.trim() : null;
}

function translateQualityPreset(run: LabRun): TranslateQualityPreset | null {
  const fromParams = run.params.translateQualityPreset;
  if (fromParams === 'fast' || fromParams === 'standard' || fromParams === 'enhanced') {
    return fromParams;
  }
  if (run.stage !== 'translate') return null;
  return inferPresetFromLegacyParams({
    enableTranslateCoT: run.params.enableTranslateCoT === true,
    enableTranslateFewShot: run.params.enableTranslateFewShot === true,
    miniModelTranslationProfile: run.params.miniModelTranslationProfile === true,
    translateLeadingContextParagraphs:
      typeof run.params.translateLeadingContextParagraphs === 'number'
        ? run.params.translateLeadingContextParagraphs
        : undefined,
  });
}

function translateChunkCount(run: LabRun): number | null {
  const summaries = run.output.translateDebug?.chunkSummaries;
  if (summaries?.length) return summaries.length;
  return null;
}

function editQualityPreset(run: LabRun): EditQualityPreset | null {
  const fromParams = run.params.editQualityPreset;
  if (fromParams === 'fast' || fromParams === 'standard' || fromParams === 'enhanced') {
    return fromParams;
  }
  if (run.stage !== 'edit') return null;
  return inferEditPresetFromLegacyParams({
    preset: typeof run.params.preset === 'string' ? run.params.preset : null,
    focus: typeof run.params.focus === 'string' ? run.params.focus : null,
  });
}

function editChunkCount(run: LabRun): number | null {
  const chunks = run.output.editDebug?.estimatedChunks;
  if (typeof chunks === 'number' && chunks > 0) return chunks;
  return null;
}

export function RunMetaBadges({ run, hideStatus }: RunMetaBadgesProps) {
  const model = runModel(run);
  const source = run.params.sourceLanguage as LabLanguage;
  const target = run.params.targetLanguage as LabLanguage;
  const preset = run.params.preset;
  const focus = run.params.focus;
  const label = runLabel(run);
  const glossaryStatus = glossaryRunStatus(run);
  const glossaryCount = glossarySnapshotCount(run);
  const qualityPreset = translateQualityPreset(run);
  const chunks = translateChunkCount(run);
  const editPreset = editQualityPreset(run);
  const editChunks = editChunkCount(run);

  return (
    <div class="pl-chip-row">
      <PlChip variant="stage" stage={run.stage} label={run.stage} />
      <PlChip
        variant="model"
        label={modelLabel(model)}
        style={modelChipStyle(model)}
        title={model}
      />
      <PlChip variant="lang" label={langPairLabel(source, target)} />
      {runTemp(run) ? <PlChip variant="neutral" label={runTemp(run)!} /> : null}
      {run.stage === 'edit' && editPreset ? (
        <PlChip variant="neutral" label={editPresetLabel(editPreset)} title="Edit quality preset" />
      ) : null}
      {run.stage === 'edit' && !editPreset && typeof preset === 'string' ? (
        <PlChip variant="preset" label={preset} />
      ) : null}
      {run.stage === 'edit' && !editPreset && typeof focus === 'string' ? (
        <PlChip variant="preset" label={normalizeEditingFocus(focus)} />
      ) : null}
      {label ? <PlChip variant="neutral" label={label} title="Run label" /> : null}
      <PlChip
        variant={glossaryStatus === 'off' || glossaryStatus === 'empty' ? 'preset' : 'neutral'}
        label={glossaryRunLabel(glossaryStatus, glossaryCount)}
        title={glossaryRunTitle(glossaryStatus)}
      />
      {run.stage === 'translate' && qualityPreset ? (
        <PlChip
          variant="neutral"
          label={presetLabel(qualityPreset)}
          title="Translate quality preset"
        />
      ) : null}
      {run.stage === 'translate' && chunks != null ? (
        <PlChip variant="neutral" label={`${chunks}×`} title="Chunks executed" />
      ) : null}
      {run.stage === 'translate' && !qualityPreset && typeof run.params.chunkSize === 'number' ? (
        <PlChip variant="neutral" label={`chunk ${run.params.chunkSize}`} />
      ) : null}
      {run.stage === 'translate' && !qualityPreset && run.params.enableTranslateCoT === true ? (
        <PlChip variant="neutral" label="CoT" />
      ) : null}
      {run.stage === 'edit' && editChunks != null ? (
        <PlChip variant="neutral" label={`${editChunks}×`} title="Chunks estimated" />
      ) : null}
      {!hideStatus ? (
        <PlChip
          variant={run.output.success ? 'status-ok' : 'status-fail'}
          label={run.output.success ? 'ok' : 'failed'}
        />
      ) : null}
    </div>
  );
}
