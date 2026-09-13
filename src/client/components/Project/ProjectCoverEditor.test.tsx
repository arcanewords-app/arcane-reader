// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  uploadProjectCover: vi.fn(),
  invalidateProject: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../api/client', () => ({
  api: {
    uploadProjectCover: (...args: unknown[]) => mocks.uploadProjectCover(...args),
  },
}));

vi.mock('../../store/projects', () => ({
  invalidateProject: (...args: unknown[]) => mocks.invalidateProject(...args),
}));

import { ProjectCoverEditor } from './ProjectCoverEditor.js';

function renderCover(overrides: Partial<Parameters<typeof ProjectCoverEditor>[0]> = {}) {
  const onDeleteRequest = vi.fn();
  const onRefreshProject = vi.fn().mockResolvedValue(undefined);
  const onError = vi.fn();
  render(
    <ProjectCoverEditor
      projectId="proj-1"
      deletingCover={false}
      onDeleteRequest={onDeleteRequest}
      onRefreshProject={onRefreshProject}
      onError={onError}
      {...overrides}
    />
  );
  return { onDeleteRequest, onRefreshProject, onError };
}

describe('ProjectCoverEditor', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('shows upload placeholder when there is no cover', () => {
    renderCover();
    expect(screen.getByText('projectInfo.uploadCoverClick')).toBeTruthy();
    expect(screen.getByLabelText('projectInfo.uploadCoverClick')).toBeTruthy();
  });

  it('requests cover delete from overlay when a cover exists', () => {
    const { onDeleteRequest } = renderCover({ coverImageUrl: 'https://cdn.example/cover.jpg' });
    fireEvent.click(screen.getByTitle('projectInfo.deleteCoverTitle'));
    expect(onDeleteRequest).toHaveBeenCalledTimes(1);
    expect(screen.getByTitle('projectInfo.replaceCoverTitle')).toBeTruthy();
  });
});
