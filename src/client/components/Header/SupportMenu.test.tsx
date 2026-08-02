// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../constants/supportLinks.js', () => ({
  getBoostySupportUrl: () => 'https://boosty.to/example',
}));

vi.mock('../../utils/analytics.js', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('../ui', () => ({
  Button: ({ children, onClick, ...props }: { children?: unknown; onClick?: () => void }) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Icon: () => null,
}));

import { trackEvent } from '../../utils/analytics.js';
import { SupportMenu } from './SupportMenu.js';

describe('SupportMenu', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders support button when URL is configured', () => {
    render(<SupportMenu />);
    expect(screen.getByText('support.menu')).toBeTruthy();
  });

  it('opens support URL on click', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<SupportMenu />);

    fireEvent.click(screen.getByLabelText('support.menuAria'));

    expect(trackEvent).toHaveBeenCalledWith('support_click', { platform: 'boosty' });
    expect(openSpy).toHaveBeenCalledWith(
      'https://boosty.to/example',
      '_blank',
      'noopener,noreferrer'
    );
    openSpy.mockRestore();
  });
});
