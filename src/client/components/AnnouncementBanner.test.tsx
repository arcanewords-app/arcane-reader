// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../contexts/AnnouncementContext', () => ({
  useAnnouncement: vi.fn(),
}));

vi.mock('../contexts/ServiceHealthContext', () => ({
  useServiceHealth: vi.fn(),
}));

vi.mock('../utils/analytics', () => ({
  trackAnnouncementView: vi.fn(),
  trackAnnouncementDismiss: vi.fn(),
  trackAnnouncementCtaClick: vi.fn(),
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

import { useAnnouncement } from '../contexts/AnnouncementContext.js';
import { useServiceHealth } from '../contexts/ServiceHealthContext.js';
import { trackAnnouncementCtaClick, trackAnnouncementDismiss } from '../utils/analytics.js';
import { route } from 'preact-router';
import { AnnouncementBanner } from './AnnouncementBanner.js';
import type { ActiveAnnouncement } from '../types.js';

const baseAlert: ActiveAnnouncement = {
  id: 'a1',
  message: 'New feature shipped',
  ctaLabel: 'Read more',
  ctaUrl: null,
  newsPostId: null,
  variant: 'info',
  contentVersion: 1,
  dismissible: true,
};

describe('AnnouncementBanner', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders null when health state is set or alert is missing', () => {
    vi.mocked(useServiceHealth).mockReturnValue({
      state: { status: 'down', message: 'DB unavailable' },
      retry: vi.fn(),
    });
    vi.mocked(useAnnouncement).mockReturnValue({
      alert: baseAlert,
      dismiss: vi.fn(),
    });

    const { container: withHealth } = render(<AnnouncementBanner />);
    expect(withHealth.firstChild).toBeNull();

    vi.mocked(useServiceHealth).mockReturnValue({ state: null, retry: vi.fn() });
    vi.mocked(useAnnouncement).mockReturnValue({ alert: null, dismiss: vi.fn() });

    const { container: noAlert } = render(<AnnouncementBanner />);
    expect(noAlert.firstChild).toBeNull();
  });

  it('shows message and dismiss tracks analytics', () => {
    const dismiss = vi.fn();
    vi.mocked(useServiceHealth).mockReturnValue({ state: null, retry: vi.fn() });
    vi.mocked(useAnnouncement).mockReturnValue({ alert: baseAlert, dismiss });

    render(<AnnouncementBanner />);

    expect(screen.getByText('New feature shipped')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'announcement.dismiss' }));

    expect(trackAnnouncementDismiss).toHaveBeenCalledWith(baseAlert);
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('internal CTA dismisses and routes after click', async () => {
    const dismiss = vi.fn().mockResolvedValue(undefined);
    const alert: ActiveAnnouncement = {
      ...baseAlert,
      ctaUrl: '/news/feature',
    };
    vi.mocked(useServiceHealth).mockReturnValue({ state: null, retry: vi.fn() });
    vi.mocked(useAnnouncement).mockReturnValue({ alert, dismiss });

    render(<AnnouncementBanner />);

    fireEvent.click(screen.getByRole('link', { name: 'announcement.openNews' }));

    expect(trackAnnouncementCtaClick).toHaveBeenCalledWith({
      id: alert.id,
      variant: alert.variant,
      contentVersion: alert.contentVersion,
      ctaUrl: alert.ctaUrl,
    });
    expect(trackAnnouncementDismiss).toHaveBeenCalledWith(alert);

    await waitFor(() => {
      expect(dismiss).toHaveBeenCalledTimes(1);
      expect(route).toHaveBeenCalledWith('/news/feature');
    });
  });
});
