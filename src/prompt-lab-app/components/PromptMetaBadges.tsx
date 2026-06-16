import type { LabPrompt } from '../api/client';
import { PlChip } from './PlChip';
import { langPairLabel } from '../utils/visualTokens';

interface PromptMetaBadgesProps {
  prompt: LabPrompt;
}

export function PromptMetaBadges({ prompt }: PromptMetaBadgesProps) {
  const isManual = prompt.origin === 'manual';

  return (
    <div class="pl-chip-row">
      <PlChip variant="stage" stage={prompt.stage} label={prompt.stage} />
      <PlChip variant="lang" label={langPairLabel(prompt.sourceLanguage, prompt.targetLanguage)} />
      <span class={isManual ? 'pl-chip pl-chip--origin-manual' : 'pl-chip pl-chip--origin'}>
        {prompt.origin}
      </span>
      {prompt.stage === 'edit' && prompt.preset ? (
        <PlChip variant="preset" label={prompt.preset} />
      ) : null}
      {prompt.stage === 'edit' && prompt.focus ? (
        <PlChip variant="preset" label={prompt.focus} />
      ) : null}
    </div>
  );
}
