// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { email?: string }) => (opts?.email ? `${key}:${opts.email}` : key),
  }),
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

vi.mock('../../utils/openMailto', () => ({
  openMailto: vi.fn(),
}));

import { route } from 'preact-router';
import { openMailto } from '../../utils/openMailto';
import { CONTACT_EMAIL } from '../../../shared/contact';
import { UpgradeRequestActions } from './UpgradeRequestActions';

describe('UpgradeRequestActions', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
  });

  it('opens mailto and shows fallback when request upgrade is clicked', () => {
    render(
      <UpgradeRequestActions
        mailSubject="Upgrade request"
        userEmail="user@example.com"
        showCompareTiers={false}
      />
    );

    fireEvent.click(screen.getByText('upgrade.requestUpgrade'));

    expect(openMailto).toHaveBeenCalledWith({
      to: CONTACT_EMAIL,
      subject: 'Upgrade request',
      body: 'upgrade.mailBodyWithEmail:user@example.com',
    });
    expect(screen.getByText(CONTACT_EMAIL)).toBeTruthy();
    expect(screen.getByText('upgrade.mailFallbackHint')).toBeTruthy();
  });

  it('routes to account tiers when compare tiers is clicked', () => {
    render(<UpgradeRequestActions mailSubject="Upgrade" showCompareTiers />);
    fireEvent.click(screen.getByText('upgrade.compareTiers'));
    expect(route).toHaveBeenCalledWith('/account-tiers');
  });

  it('copies contact email to clipboard from fallback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText },
    });

    render(<UpgradeRequestActions mailSubject="Upgrade" showCompareTiers={false} />);
    fireEvent.click(screen.getByText('upgrade.requestUpgrade'));
    fireEvent.click(screen.getByText('upgrade.copyEmail'));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(CONTACT_EMAIL);
      expect(screen.getByText('upgrade.copyEmailDone')).toBeTruthy();
    });
  });

  it('routes to contact page from fallback link', () => {
    render(<UpgradeRequestActions mailSubject="Upgrade" showCompareTiers={false} />);
    fireEvent.click(screen.getByText('upgrade.requestUpgrade'));
    fireEvent.click(screen.getByText('upgrade.contactPageLink'));
    expect(route).toHaveBeenCalledWith('/contact');
  });
});
