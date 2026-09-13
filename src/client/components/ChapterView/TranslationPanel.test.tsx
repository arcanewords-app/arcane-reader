// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Chapter, Project } from '../../types.js';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../api/client', () => ({
  api: {
    updateSettings: vi.fn(),
  },
}));

vi.mock('../../utils/analytics', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('../Project/ProjectLanguagePairFields', () => ({
  ProjectLanguagePairFields: () => <div data-testid="lang-pair" />,
}));

import { TranslationPanel } from './TranslationPanel.js';

const chapter = {
  id: 'ch1',
  number: 1,
  title: 'Chapter One',
  originalText: 'Hello',
  translatedText: '',
  status: 'pending',
  paragraphs: [{ id: 'p1', index: 0, originalText: 'Hello', translatedText: '', status: 'pending' }],
} as Chapter;

const project = {
  id: 'proj-1',
  name: 'Test Project',
  sourceLanguage: 'en',
  targetLanguage: 'ru',
  chapters: [],
  glossary: [],
  settings: {
    temperature: 0.7,
    stageModels: {
      analysis: 'gpt-4.1-mini',
      translation: 'gpt-4.1-mini',
      editing: 'gpt-4.1-mini',
    },
  },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
} as Project;

function renderPanel(overrides: Partial<Parameters<typeof TranslationPanel>[0]> = {}) {
  const startTranslation = vi.fn();
  const onCancelTranslation = vi.fn();
  render(
    <TranslationPanel
      chapter={chapter}
      project={project}
      projectId="proj-1"
      startTranslation={startTranslation}
      translating={false}
      emptyCount={1}
      selectedParagraphIds={[]}
      onSelectAllEmpty={vi.fn()}
      onDeselectAll={vi.fn()}
      onCancelTranslation={onCancelTranslation}
      onChapterUpdate={vi.fn()}
      {...overrides}
    />
  );
  return { startTranslation, onCancelTranslation };
}

describe('TranslationPanel', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('renders scope controls and start action', () => {
    renderPanel();
    expect(screen.getByText('translationPanel.scope')).toBeTruthy();
    expect(screen.getByText('translationPanel.start')).toBeTruthy();
  });

  it('starts translation with selected stages', () => {
    const { startTranslation } = renderPanel();
    fireEvent.click(screen.getByText('translationPanel.start'));
    expect(startTranslation).toHaveBeenCalledTimes(1);
    expect(startTranslation.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        stages: expect.arrayContaining(['analysis', 'translation', 'editing']),
      })
    );
  });

  it('cancels an in-flight translation', () => {
    const { onCancelTranslation } = renderPanel({ translating: true });
    fireEvent.click(screen.getByText('chapter.cancelTranslate'));
    expect(onCancelTranslation).toHaveBeenCalledTimes(1);
  });
});
