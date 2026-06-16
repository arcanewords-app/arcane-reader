import type { LabStage } from '../api/client';
import { STAGE_CHIP_CLASS } from '../utils/visualTokens';

export type PlChipVariant =
  | 'stage'
  | 'model'
  | 'lang'
  | 'preset'
  | 'origin'
  | 'status-ok'
  | 'status-fail'
  | 'neutral';

interface PlChipProps {
  variant: PlChipVariant;
  label: string;
  stage?: LabStage;
  style?: Record<string, string>;
  title?: string;
}

function chipClass(variant: PlChipVariant, stage?: LabStage): string {
  const parts = ['pl-chip'];
  if (variant === 'stage' && stage) {
    parts.push(STAGE_CHIP_CLASS[stage]);
  } else if (variant === 'model') {
    parts.push('pl-chip--model');
  } else if (variant === 'lang') {
    parts.push('pl-chip--lang');
  } else if (variant === 'preset') {
    parts.push('pl-chip--preset');
  } else if (variant === 'origin') {
    parts.push('pl-chip--origin');
  } else if (variant === 'status-ok') {
    parts.push('pl-chip--status-ok');
  } else if (variant === 'status-fail') {
    parts.push('pl-chip--status-fail');
  } else {
    parts.push('pl-chip--neutral');
  }
  return parts.join(' ');
}

export function PlChip({ variant, label, stage, style, title }: PlChipProps) {
  return (
    <span class={chipClass(variant, stage)} style={style} title={title}>
      {label}
    </span>
  );
}
