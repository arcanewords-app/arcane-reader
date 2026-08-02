// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

vi.mock('../../hooks/useUserRole.js', () => ({
  useUserRole: () => ({
    user: { id: 'u1', role: 'author' },
    role: 'author',
    isGuest: false,
    isAtLeast: () => true,
    refresh: vi.fn(),
  }),
}));

vi.mock('../../api/client.js', () => ({
  api: {
    updateProjectSettings: vi.fn(),
    updateProjectLanguages: vi.fn(),
  },
}));

vi.mock('../../store/projects.js', () => ({
  invalidateProject: vi.fn(),
}));

vi.mock('../Project/ProjectLanguagePairFields', () => ({
  ProjectLanguagePairFields: () => <div data-testid="lang-pair" />,
}));

import { SettingsModal } from './SettingsModal.js';

function makeProject(): Project {
  return {
    id: 'p1',
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
  };
}

describe('SettingsModal', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders title when open', () => {
    render(
      <SettingsModal project={makeProject()} isOpen onClose={vi.fn()} onSettingsChange={vi.fn()} />
    );
    expect(screen.getByText('settings.title')).toBeTruthy();
  });

  it('does not render content when closed', () => {
    render(
      <SettingsModal
        project={makeProject()}
        isOpen={false}
        onClose={vi.fn()}
        onSettingsChange={vi.fn()}
      />
    );
    expect(screen.queryByText('settings.title')).toBeNull();
  });

  it('calls onClose from close button', () => {
    const onClose = vi.fn();
    render(
      <SettingsModal project={makeProject()} isOpen onClose={onClose} onSettingsChange={vi.fn()} />
    );
    fireEvent.click(screen.getByText('common.close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(
      <SettingsModal project={makeProject()} isOpen onClose={onClose} onSettingsChange={vi.fn()} />
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
