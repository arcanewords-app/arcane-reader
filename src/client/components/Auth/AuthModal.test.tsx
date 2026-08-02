// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('./LoginForm.js', () => ({
  LoginForm: ({ onSwitchToRegister }: { onSwitchToRegister: () => void }) => (
    <div data-testid="login-form">
      <button type="button" onClick={onSwitchToRegister}>
        stub-switch-register
      </button>
    </div>
  ),
}));

vi.mock('./RegisterForm.js', () => ({
  RegisterForm: ({ onSwitchToLogin }: { onSwitchToLogin: () => void }) => (
    <div data-testid="register-form">
      <button type="button" onClick={onSwitchToLogin}>
        stub-switch-login
      </button>
    </div>
  ),
}));

import { AuthModal } from './AuthModal.js';

describe('AuthModal', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('shows login form by default and switches to register tab', () => {
    render(<AuthModal isOpen onSuccess={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('auth.loginTitle')).toBeTruthy();
    expect(screen.getByTestId('login-form')).toBeTruthy();
    expect(screen.queryByTestId('register-form')).toBeNull();

    fireEvent.click(screen.getByText('auth.register'));
    expect(screen.getByText('auth.registerTitle')).toBeTruthy();
    expect(screen.getByTestId('register-form')).toBeTruthy();
    expect(screen.queryByTestId('login-form')).toBeNull();
  });

  it('opens on register tab when initialMode is register', () => {
    render(<AuthModal isOpen initialMode="register" onSuccess={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('auth.registerTitle')).toBeTruthy();
    expect(screen.getByTestId('register-form')).toBeTruthy();
  });

  it('switches tabs via stub form callbacks', () => {
    render(<AuthModal isOpen onSuccess={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('stub-switch-register'));
    expect(screen.getByTestId('register-form')).toBeTruthy();

    fireEvent.click(screen.getByText('stub-switch-login'));
    expect(screen.getByTestId('login-form')).toBeTruthy();
  });

  it('does not render content when closed', () => {
    render(<AuthModal isOpen={false} onSuccess={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByTestId('login-form')).toBeNull();
    expect(screen.queryByTestId('register-form')).toBeNull();
  });
});
