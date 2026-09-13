// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Project, Publication } from '../../types.js';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../api/client.js', () => ({
  api: {
    updateProjectMetadata: vi.fn(),
    updatePublicationDisplaySettings: vi.fn(),
  },
}));

vi.mock('../../store/projects.js', () => ({
  invalidateProject: vi.fn(),
}));

import { ProjectPublicationSection } from './ProjectPublicationSection.js';

const project = {
  id: 'proj-1',
  name: 'Test Project',
  sourceLanguage: 'en',
  targetLanguage: 'ru',
  chapters: [],
  glossary: [],
  settings: {},
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
} as Project;

const published = {
  id: 'pub-1',
  slug: 'test-book',
  status: 'published',
  showGlossary: true,
} as Publication;

function renderSection(
  overrides: Partial<Parameters<typeof ProjectPublicationSection>[0]> = {}
) {
  const onOpenPublishModal = vi.fn();
  const onUnpublishRequest = vi.fn();
  render(
    <ProjectPublicationSection
      project={project}
      publication={null}
      publicationLoading={false}
      setPublication={vi.fn()}
      stats={{ chapters: 2, translated: 1, glossary: 0 }}
      hasPublishableTranslator
      buildingExports={false}
      updatingPublication={false}
      unpublishing={false}
      onRefreshProject={vi.fn().mockResolvedValue(undefined)}
      onOpenPublishModal={onOpenPublishModal}
      onUnpublishRequest={onUnpublishRequest}
      onUpdatePublication={vi.fn()}
      onBuildExports={vi.fn()}
      onError={vi.fn()}
      {...overrides}
    />
  );
  return { onOpenPublishModal, onUnpublishRequest };
}

describe('ProjectPublicationSection', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('renders unpublished state and opens the publish modal', () => {
    const { onOpenPublishModal } = renderSection();
    expect(screen.getByText('projectInfo.publicationTitle')).toBeTruthy();
    expect(screen.getByText('projectInfo.publicationNotPublished')).toBeTruthy();
    fireEvent.click(screen.getByText('projectInfo.publish'));
    expect(onOpenPublishModal).toHaveBeenCalledTimes(1);
  });

  it('disables publish when the project has no chapters', () => {
    renderSection({ stats: { chapters: 0, translated: 0, glossary: 0 } });
    expect((screen.getByText('projectInfo.publish').closest('button') as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(screen.getByText('projectInfo.publishRequiresChapters')).toBeTruthy();
  });

  it('shows published actions and requests unpublish', () => {
    const { onUnpublishRequest } = renderSection({ publication: published });
    expect(screen.getByText('projectInfo.publicationPublished')).toBeTruthy();
    fireEvent.click(screen.getByText('projectInfo.unpublish'));
    expect(onUnpublishRequest).toHaveBeenCalledTimes(1);
  });
});
