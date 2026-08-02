// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { ProjectLanguagePairFields } from './ProjectLanguagePairFields.js';

function changeSelect(select: HTMLSelectElement, value: string) {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('ProjectLanguagePairFields', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('calls onSourceLanguageChange when source select changes', () => {
    const onSourceLanguageChange = vi.fn();
    render(
      <ProjectLanguagePairFields
        sourceLanguage="en"
        onSourceLanguageChange={onSourceLanguageChange}
        targetLanguage="ru"
        onTargetLanguageChange={vi.fn()}
      />
    );

    changeSelect(screen.getByLabelText('project.sourceLanguageLabel') as HTMLSelectElement, 'ko');
    expect(onSourceLanguageChange).toHaveBeenCalledWith('ko');
  });

  it('calls onTargetLanguageChange when target select changes', () => {
    const onTargetLanguageChange = vi.fn();
    render(
      <ProjectLanguagePairFields
        sourceLanguage="en"
        onSourceLanguageChange={vi.fn()}
        targetLanguage="ru"
        onTargetLanguageChange={onTargetLanguageChange}
      />
    );

    changeSelect(screen.getByLabelText('project.targetLanguageLabel') as HTMLSelectElement, 'be');
    expect(onTargetLanguageChange).toHaveBeenCalledWith('be');
  });

  it('coerces source when target change invalidates current source', () => {
    const onSourceLanguageChange = vi.fn();
    const onTargetLanguageChange = vi.fn();
    render(
      <ProjectLanguagePairFields
        sourceLanguage="ru"
        onSourceLanguageChange={onSourceLanguageChange}
        targetLanguage="be"
        onTargetLanguageChange={onTargetLanguageChange}
      />
    );

    changeSelect(screen.getByLabelText('project.targetLanguageLabel') as HTMLSelectElement, 'ru');
    expect(onTargetLanguageChange).toHaveBeenCalledWith('ru');
    expect(onSourceLanguageChange).toHaveBeenCalledWith('en');
  });

  it('shows ru source hint for ru→be pair', () => {
    render(
      <ProjectLanguagePairFields
        sourceLanguage="ru"
        onSourceLanguageChange={vi.fn()}
        targetLanguage="be"
        onTargetLanguageChange={vi.fn()}
      />
    );
    expect(screen.getByText('project.ruSourceHint')).toBeTruthy();
  });
});
