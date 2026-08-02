// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

vi.mock('../hooks/useUserRole.js', () => ({
  useUserRole: () => ({
    user: { id: 'u1', email: 'a@example.com', role: 'user' },
    role: 'user',
    isGuest: false,
    isAtLeast: (min: string) => min === 'user' || min === 'guest',
    refresh: vi.fn(),
  }),
}));

vi.mock('../components/Cabinet/ReadingHistorySection.js', () => ({
  ReadingHistorySection: () => <div data-testid="reading-history" />,
}));

vi.mock('../components/Dashboard/ProjectGrid.js', () => ({
  ProjectGrid: () => <div data-testid="project-grid" />,
}));

vi.mock('../components/ChapterView/ReaderSettings.js', () => ({
  ReaderSettingsPanel: () => <div data-testid="reader-settings" />,
}));

vi.mock('../components/Project/ProjectLanguagePairFields.js', () => ({
  ProjectLanguagePairFields: () => null,
}));

vi.mock('../store/projects.js', () => ({
  projectsCache: { value: [] },
  projectsLoading: { value: false },
  loadProjects: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../api/client.js', () => ({
  api: {
    createProject: vi.fn(),
    getUserReaderSettings: vi.fn().mockResolvedValue(null),
    updateUserReaderSettings: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../components/ui', () => ({
  Button: ({ children, ...props }: { children?: unknown }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Input: (props: Record<string, unknown>) => <input {...props} />,
  Modal: () => null,
  LoadingSpinner: () => <span>loading</span>,
  Icon: () => null,
}));

import { CabinetPage } from './CabinetPage.js';

describe('CabinetPage', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('renders reading tab with history section by default', () => {
    render(<CabinetPage />);
    expect(screen.getByText('cabinet.readingTitle')).toBeTruthy();
    expect(screen.getByTestId('reading-history')).toBeTruthy();
  });
});
