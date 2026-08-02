// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectWithChapterList } from '../types';

const mocks = vi.hoisted(() => {
  const mockProject: ProjectWithChapterList = {
    id: 'proj-1',
    name: 'Reading Project',
    chapters: [
      { id: 'ch1', number: 1, title: 'One', status: 'completed' },
      { id: 'ch2', number: 2, title: 'Two', status: 'pending' },
    ],
  } as ProjectWithChapterList;
  return {
    mockProject,
    getProject: vi.fn().mockResolvedValue(mockProject),
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

vi.mock('../store/projects.js', () => ({
  getProject: (...args: unknown[]) => mocks.getProject(...args),
}));

vi.mock('../components/ReadingMode', () => ({
  ReadingMode: () => <div data-testid="reading-mode" />,
}));

vi.mock('../components/ui', () => ({
  PageLoading: ({ text }: { text?: string }) => <div data-testid="page-loading">{text}</div>,
}));

import { ReadingModePage } from './ReadingModePage.js';

describe('ReadingModePage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows loading then reading mode wrapper', async () => {
    render(<ReadingModePage projectId="proj-1" chapterId="ch1" />);
    expect(screen.getByTestId('page-loading')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByTestId('reading-mode')).toBeTruthy();
    });
  });
});
