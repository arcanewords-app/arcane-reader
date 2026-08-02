// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { email?: string }) =>
      opts?.email != null ? `${key}:${opts.email}` : key,
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}));

vi.mock('../../services/authService.js', () => ({
  authService: {
    register: vi.fn(),
  },
}));

vi.mock('../../utils/analytics.js', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('preact-router', () => ({
  route: vi.fn(),
}));

import { authService } from '../../services/authService.js';
import { trackEvent } from '../../utils/analytics.js';
import { RegisterForm } from './RegisterForm.js';

describe('RegisterForm', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows success state after successful registration', async () => {
    vi.mocked(authService.register).mockResolvedValue(undefined as never);

    render(<RegisterForm onSuccess={vi.fn()} onSwitchToLogin={vi.fn()} />);

    fireEvent.input(screen.getByLabelText('Email'), {
      target: { value: 'new@example.com' },
    });
    fireEvent.input(screen.getByLabelText('auth.password'), {
      target: { value: 'secret12' },
    });
    fireEvent.input(screen.getByLabelText('auth.confirmPassword'), {
      target: { value: 'secret12' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.submit(screen.getByText('auth.submitRegister').closest('form')!);

    await waitFor(() => {
      expect(authService.register).toHaveBeenCalledWith('new@example.com', 'secret12');
      expect(trackEvent).toHaveBeenCalledWith('sign_up');
      expect(screen.getByText('auth.registrationSuccess')).toBeTruthy();
      expect(screen.getByText('auth.emailSentConfirmation:new@example.com')).toBeTruthy();
    });
  });

  it('shows validation error when passwords mismatch', async () => {
    render(<RegisterForm onSuccess={vi.fn()} onSwitchToLogin={vi.fn()} />);

    fireEvent.input(screen.getByLabelText('Email'), {
      target: { value: 'a@example.com' },
    });
    fireEvent.input(screen.getByLabelText('auth.password'), {
      target: { value: 'secret12' },
    });
    fireEvent.input(screen.getByLabelText('auth.confirmPassword'), {
      target: { value: 'other12' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.submit(screen.getByText('auth.submitRegister').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('auth.passwordsMismatch')).toBeTruthy();
    });
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('shows error message on register failure', async () => {
    vi.mocked(authService.register).mockRejectedValue(new Error('Email already registered'));

    render(<RegisterForm onSuccess={vi.fn()} onSwitchToLogin={vi.fn()} />);

    fireEvent.input(screen.getByLabelText('Email'), {
      target: { value: 'taken@example.com' },
    });
    fireEvent.input(screen.getByLabelText('auth.password'), {
      target: { value: 'secret12' },
    });
    fireEvent.input(screen.getByLabelText('auth.confirmPassword'), {
      target: { value: 'secret12' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.submit(screen.getByText('auth.submitRegister').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Email already registered')).toBeTruthy();
    });
  });

  it('calls onSwitchToLogin from footer link', () => {
    const onSwitchToLogin = vi.fn();
    render(<RegisterForm onSuccess={vi.fn()} onSwitchToLogin={onSwitchToLogin} />);
    fireEvent.click(screen.getByText('auth.haveAccountLogin'));
    expect(onSwitchToLogin).toHaveBeenCalledTimes(1);
  });
});
