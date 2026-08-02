// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../contexts/ServiceHealthContext', () => ({
  useServiceHealth: vi.fn(),
}));

import { useServiceHealth } from '../contexts/ServiceHealthContext.js';
import { ServiceStatusBanner } from './ServiceStatusBanner.js';

describe('ServiceStatusBanner', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('hides when health state is null', () => {
    vi.mocked(useServiceHealth).mockReturnValue({
      state: null,
      retry: vi.fn(),
    });
    const { container } = render(<ServiceStatusBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('shows down message when status is down', () => {
    vi.mocked(useServiceHealth).mockReturnValue({
      state: { status: 'down', message: 'DB unavailable' },
      retry: vi.fn(),
    });
    render(<ServiceStatusBanner />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('serviceHealth.down')).toBeTruthy();
    expect(screen.getByText('serviceHealth.retry')).toBeTruthy();
  });

  it('shows recovered message without retry', () => {
    vi.mocked(useServiceHealth).mockReturnValue({
      state: { status: 'recovered' },
      retry: vi.fn(),
    });
    render(<ServiceStatusBanner />);
    expect(screen.getByText('serviceHealth.recovered')).toBeTruthy();
    expect(screen.queryByText('serviceHealth.retry')).toBeNull();
  });
});
