import type { LabLanguage, LabRun } from '../api/client';
import { PlChip } from './PlChip';
import { langPairLabel, modelChipStyle, modelLabel } from '../utils/visualTokens';

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

export function RunMetaBadges({ run, hideStatus }: RunMetaBadgesProps) {
  const model = runModel(run);
  const source = run.params.sourceLanguage as LabLanguage;
  const target = run.params.targetLanguage as LabLanguage;
  const preset = run.params.preset;
  const focus = run.params.focus;
  const label = runLabel(run);

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
      {run.stage === 'edit' && typeof preset === 'string' ? (
        <PlChip variant="preset" label={preset} />
      ) : null}
      {run.stage === 'edit' && typeof focus === 'string' ? (
        <PlChip variant="preset" label={focus} />
      ) : null}
      {label ? <PlChip variant="neutral" label={label} title="Run label" /> : null}
      {!hideStatus ? (
        <PlChip
          variant={run.output.success ? 'status-ok' : 'status-fail'}
          label={run.output.success ? 'ok' : 'failed'}
        />
      ) : null}
    </div>
  );
}
