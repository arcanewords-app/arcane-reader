// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { BatchStageOptions } from './BatchStageOptions.js';

function renderOptions(
  overrides: Partial<Parameters<typeof BatchStageOptions>[0]> = {}
) {
  const onToggleStage = vi.fn();
  const onBatchTranslateChapterTitlesChange = vi.fn();
  render(
    <BatchStageOptions
      batchSelectedStages={['analysis', 'translation']}
      onToggleStage={onToggleStage}
      batchTranslateChapterTitles={false}
      onBatchTranslateChapterTitlesChange={onBatchTranslateChapterTitlesChange}
      includeGlossaryInEditing
      onToggleIncludeGlossaryInEditing={vi.fn()}
      editingFocus="polish"
      onEditingFocusChange={vi.fn()}
      editingStylePreset="default"
      onEditingStylePresetChange={vi.fn()}
      {...overrides}
    />
  );
  return { onToggleStage, onBatchTranslateChapterTitlesChange };
}

describe('BatchStageOptions', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('renders stage checkboxes and toggles analysis', () => {
    const { onToggleStage } = renderOptions();
    expect(screen.getByText('translationPanel.stages')).toBeTruthy();
    fireEvent.click(screen.getByText('projectInfo.stageAnalysis'));
    expect(onToggleStage).toHaveBeenCalledWith('analysis');
  });

  it('enables chapter-title translation only when translation stage is selected', () => {
    const { onBatchTranslateChapterTitlesChange } = renderOptions();
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    const titleCheckbox = checkboxes[checkboxes.length - 1];
    expect(titleCheckbox.disabled).toBe(false);
    fireEvent.click(titleCheckbox);
    expect(onBatchTranslateChapterTitlesChange).toHaveBeenCalledWith(true);
  });

  it('shows editing settings only when editing stage is selected', () => {
    renderOptions({ batchSelectedStages: ['analysis', 'translation'] });
    expect(screen.queryByText('projectInfo.editingSettingsLabel')).toBeNull();

    cleanup();
    renderOptions({ batchSelectedStages: ['editing'] });
    expect(screen.getByText('projectInfo.editingSettingsLabel')).toBeTruthy();
    expect(screen.getByLabelText('settings.includeGlossaryInEditing')).toBeTruthy();
  });
});
