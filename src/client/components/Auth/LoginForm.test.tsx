// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../services/authService', () => ({
  authService: {
    login: vi.fn(),
  },
}));

vi.mock('../../utils/analytics', () => ({
  trackEvent: vi.fn(),
}));

import { authService } from '../../services/authService.js';
import { trackEvent } from '../../utils/analytics.js';
import { LoginForm } from './LoginForm.js';

describe('LoginForm', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('calls onSuccess on successful login', async () => {
    const user = { id: 'u1', email: 'a@example.com', role: 'user' as const };
    vi.mocked(authService.login).mockResolvedValue({ user, token: 't' } as never);
    const onSuccess = vi.fn();

    render(<LoginForm onSuccess={onSuccess} onSwitchToRegister={vi.fn()} />);

    fireEvent.input(screen.getByLabelText('auth.email'), {
      target: { value: 'a@example.com' },
    });
    fireEvent.input(screen.getByLabelText('auth.password'), {
      target: { value: 'secret' },
    });
    fireEvent.submit(screen.getByText('auth.submitLogin').closest('form')!);

    await waitFor(() => {
      expect(authService.login).toHaveBeenCalledWith('a@example.com', 'secret');
      expect(trackEvent).toHaveBeenCalledWith('login');
      expect(onSuccess).toHaveBeenCalledWith(user);
    });
  });

  it('shows error message on login failure', async () => {
    vi.mocked(authService.login).mockRejectedValue(new Error('Invalid credentials'));

    render(<LoginForm onSuccess={vi.fn()} onSwitchToRegister={vi.fn()} />);

    fireEvent.input(screen.getByLabelText('auth.email'), {
      target: { value: 'a@example.com' },
    });
    fireEvent.input(screen.getByLabelText('auth.password'), {
      target: { value: 'bad' },
    });
    fireEvent.submit(screen.getByText('auth.submitLogin').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeTruthy();
    });
  });

  it('calls onEmailNotConfirmed when email is not confirmed', async () => {
    vi.mocked(authService.login).mockRejectedValue(new Error('Email not confirmed'));
    const onEmailNotConfirmed = vi.fn();

    render(
      <LoginForm
        onSuccess={vi.fn()}
        onSwitchToRegister={vi.fn()}
        onEmailNotConfirmed={onEmailNotConfirmed}
      />
    );

    fireEvent.input(screen.getByLabelText('auth.email'), {
      target: { value: 'unconfirmed@example.com' },
    });
    fireEvent.input(screen.getByLabelText('auth.password'), {
      target: { value: 'secret' },
    });
    fireEvent.submit(screen.getByText('auth.submitLogin').closest('form')!);

    await waitFor(() => {
      expect(onEmailNotConfirmed).toHaveBeenCalledWith('unconfirmed@example.com');
    });
    expect(screen.queryByText('Email not confirmed')).toBeNull();
  });
});
