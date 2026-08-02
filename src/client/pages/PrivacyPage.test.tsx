// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

vi.mock('../hooks/useStaticPageMeta.js', () => ({
  useStaticPageMeta: vi.fn(),
}));

vi.mock('../contexts/CookieConsentContext.js', () => ({
  useCookieConsent: () => ({
    consent: null,
    resetConsent: vi.fn(),
  }),
}));

vi.mock('../components/ui', () => ({
  Button: ({ children, ...props }: { children?: unknown }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

import { PrivacyPage } from './PrivacyPage.js';

describe('PrivacyPage', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders without crash and shows title', () => {
    render(<PrivacyPage />);
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  });
});
