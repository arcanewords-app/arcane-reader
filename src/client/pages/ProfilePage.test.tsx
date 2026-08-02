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
    user: { id: 'u1', email: 'reader@example.com', role: 'user' },
    role: 'user',
    isGuest: false,
    isAtLeast: () => false,
    refresh: vi.fn(),
  }),
}));

vi.mock('../hooks/useUrlSync.js', () => ({
  useUrlSync: () => ({
    state: 'reading' as const,
    setState: vi.fn(),
  }),
}));

vi.mock('../components/Cabinet/ReadingHistorySection.js', () => ({
  ReadingHistorySection: () => <div data-testid="reading-history" />,
}));

vi.mock('../components/Cabinet/QuotesSection.js', () => ({
  QuotesSection: () => <div data-testid="quotes-section" />,
}));

vi.mock('../components/ChapterView/ReaderSettings.js', () => ({
  ReaderSettingsPanel: () => <div data-testid="reader-settings" />,
}));

vi.mock('../components/TranslatorPseudonym/TranslatorPseudonymsSection.js', () => ({
  TranslatorPseudonymsSection: () => null,
}));

vi.mock('../components/UpgradeRequest', () => ({
  UpgradeRequestActions: () => null,
}));

vi.mock('../api/client.js', () => ({
  api: {
    getUserReaderSettings: vi.fn().mockResolvedValue(null),
    updateUserReaderSettings: vi.fn().mockResolvedValue(undefined),
    uploadAvatar: vi.fn(),
  },
}));

vi.mock('../services/authService.js', () => ({
  authService: { updateUserCache: vi.fn() },
}));

vi.mock('../components/ui', () => ({
  Button: ({ children, ...props }: { children?: unknown }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Icon: () => null,
}));

import { ProfilePage } from './ProfilePage.js';

describe('ProfilePage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders reading tab heading and history section', () => {
    render(<ProfilePage />);
    expect(screen.getByText('profile.readingTitle')).toBeTruthy();
    expect(screen.getByTestId('reading-history')).toBeTruthy();
  });
});
