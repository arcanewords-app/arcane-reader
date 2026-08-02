// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

vi.mock('../../contexts/CookieConsentContext', () => ({
  useCookieConsent: vi.fn(),
}));

import { route } from 'preact-router';
import { useCookieConsent } from '../../contexts/CookieConsentContext';
import { CookieBanner } from './CookieBanner';

describe('CookieBanner', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders null when consent has been decided', () => {
    vi.mocked(useCookieConsent).mockReturnValue({
      hasDecided: true,
      acceptConsent: vi.fn(),
      rejectConsent: vi.fn(),
    } as never);

    const { container } = render(<CookieBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('calls acceptConsent when accept is clicked', () => {
    const acceptConsent = vi.fn();
    vi.mocked(useCookieConsent).mockReturnValue({
      hasDecided: false,
      acceptConsent,
      rejectConsent: vi.fn(),
    } as never);

    render(<CookieBanner />);
    fireEvent.click(screen.getByText('cookieBanner.accept'));
    expect(acceptConsent).toHaveBeenCalledTimes(1);
  });

  it('calls rejectConsent when reject is clicked', () => {
    const rejectConsent = vi.fn();
    vi.mocked(useCookieConsent).mockReturnValue({
      hasDecided: false,
      acceptConsent: vi.fn(),
      rejectConsent,
    } as never);

    render(<CookieBanner />);
    fireEvent.click(screen.getByText('cookieBanner.reject'));
    expect(rejectConsent).toHaveBeenCalledTimes(1);
  });

  it('routes to privacy when privacy link is clicked', () => {
    vi.mocked(useCookieConsent).mockReturnValue({
      hasDecided: false,
      acceptConsent: vi.fn(),
      rejectConsent: vi.fn(),
    } as never);

    render(<CookieBanner />);
    fireEvent.click(screen.getByText('cookieBanner.privacyLink'));
    expect(route).toHaveBeenCalledWith('/privacy');
  });
});
