// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectJobItem } from '../../types.js';

const mocks = vi.hoisted(() => ({
  getProjectJobs: vi.fn(),
  cancelTranslateJob: vi.fn(),
  cancelAnalysisJob: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) =>
      opts?.count != null ? `${key}:${opts.count}` : key,
  }),
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

vi.mock('../../api/client.js', () => ({
  api: {
    getProjectJobs: (...args: unknown[]) => mocks.getProjectJobs(...args),
    cancelTranslateJob: (...args: unknown[]) => mocks.cancelTranslateJob(...args),
    cancelAnalysisJob: (...args: unknown[]) => mocks.cancelAnalysisJob(...args),
  },
}));

import { JobsPanel } from './JobsPanel.js';

const mockProject = { id: 'proj-1', name: 'Test Project' };

const activeTranslateJob: ProjectJobItem = {
  type: 'translate',
  jobId: 'job-1',
  status: 'processing',
  current: 1,
  total: 3,
  progress: 33,
  chapters: [{ chapterId: 'ch1', title: 'Chapter 1', status: 'processing' }],
  totalTokensUsed: 0,
  errors: [],
  startedAt: new Date().toISOString(),
  finishedAt: null,
};

describe('JobsPanel', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders nothing when there are no jobs', async () => {
    mocks.getProjectJobs.mockResolvedValue({ jobs: [] });

    const { container } = render(<JobsPanel project={mockProject} />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('shows active job with status and progress', async () => {
    mocks.getProjectJobs.mockResolvedValue({ jobs: [activeTranslateJob] });

    render(<JobsPanel project={mockProject} />);

    await waitFor(() => {
      expect(screen.getByText('jobsPanel.title')).toBeTruthy();
      expect(screen.getByText('jobsPanel.translation')).toBeTruthy();
      expect(screen.getByText('jobsPanel.processing')).toBeTruthy();
      expect(screen.getByText('1 / 3')).toBeTruthy();
    });
  });

  it('cancels an active translate job', async () => {
    mocks.getProjectJobs
      .mockResolvedValueOnce({ jobs: [activeTranslateJob] })
      .mockResolvedValueOnce({ jobs: [] });
    mocks.cancelTranslateJob.mockResolvedValue(undefined);

    render(<JobsPanel project={mockProject} />);

    await waitFor(() => {
      expect(screen.getByText('jobsPanel.cancel')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('jobsPanel.cancel'));

    await waitFor(() => {
      expect(mocks.cancelTranslateJob).toHaveBeenCalledWith('proj-1', 'job-1');
    });
  });
});
