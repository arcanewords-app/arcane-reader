// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Project, PublicEntity } from '../../types.js';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../EntityCard', () => ({
  EntityCard: ({ entity }: { entity: PublicEntity }) => (
    <div data-testid={`entity-card-${entity.id}`}>{entity.name}</div>
  ),
  TagChip: ({ entity }: { entity: PublicEntity }) => <span>{entity.name}</span>,
  EntityPickerModal: ({ isOpen, kind }: { isOpen: boolean; kind: string }) =>
    isOpen ? <div data-testid={`picker-${kind}`} /> : null,
}));

import { ProjectEntitySection } from './ProjectEntitySection.js';

const project = {
  id: 'proj-1',
  name: 'Test Project',
  sourceLanguage: 'en',
  targetLanguage: 'ru',
  metadata: { translationStatus: 'in_progress' },
  chapters: [],
  glossary: [],
  settings: {},
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
} as Project;

function renderSection(
  overrides: Partial<Parameters<typeof ProjectEntitySection>[0]> = {}
) {
  const onShowAuthorPickerChange = vi.fn();
  const onTranslationStatusChange = vi.fn();
  render(
    <ProjectEntitySection
      project={project}
      authorEntity={null}
      translatorEntity={null}
      tagEntities={[]}
      savingEntities={false}
      isOwnedTranslatorEntity={() => true}
      showAuthorPicker={false}
      onShowAuthorPickerChange={onShowAuthorPickerChange}
      showTranslatorPicker={false}
      onShowTranslatorPickerChange={vi.fn()}
      showTagPicker={false}
      onShowTagPickerChange={vi.fn()}
      onAuthorSelect={vi.fn()}
      onTranslatorSelect={vi.fn()}
      onTagSelect={vi.fn()}
      onRemoveAuthor={vi.fn()}
      onRemoveTranslator={vi.fn()}
      onRemoveTag={vi.fn()}
      onTranslationStatusChange={onTranslationStatusChange}
      {...overrides}
    />
  );
  return { onShowAuthorPickerChange, onTranslationStatusChange };
}

describe('ProjectEntitySection', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('renders entity labels and opens the author picker', () => {
    const { onShowAuthorPickerChange } = renderSection();
    expect(screen.getByText('projectInfo.entitySectionTitle')).toBeTruthy();
    fireEvent.click(screen.getByText('projectInfo.selectAuthor'));
    expect(onShowAuthorPickerChange).toHaveBeenCalledWith(true);
  });

  it('shows selected author card and remove control', () => {
    const onRemoveAuthor = vi.fn();
    renderSection({
      authorEntity: {
        id: 'a1',
        kind: 'author',
        name: 'Jane Austen',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      onRemoveAuthor,
    });
    expect(screen.getByText('Jane Austen')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('projectInfo.removeAuthor'));
    expect(onRemoveAuthor).toHaveBeenCalledTimes(1);
  });

  it('toggles an active translation status back to unset', () => {
    const { onTranslationStatusChange } = renderSection();
    fireEvent.click(screen.getByText('projectInfo.translationStatus.inProgress'));
    expect(onTranslationStatusChange).toHaveBeenCalledWith(null);
  });
});
