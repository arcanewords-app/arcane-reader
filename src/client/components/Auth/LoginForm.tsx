import { useState } from 'preact/hooks';
import { Button, Input } from '../ui';
import { authService } from '../../services/authService';
import type { AuthUser } from '../../types';

interface LoginFormProps {
  onSuccess: (user: AuthUser) => void;
  onSwitchToRegister: () => void;
  onEmailNotConfirmed?: (email: string) => void;
}

export function LoginForm({ onSuccess, onSwitchToRegister, onEmailNotConfirmed }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Check if error is about email not confirmed
  // Supabase returns errors like "Email not confirmed" when trying to login with unconfirmed email
  const isEmailNotConfirmedError = (errorMessage: string): boolean => {
    const lowerMessage = errorMessage.toLowerCase();
    const emailNotConfirmedKeywords = [
      'email not confirmed',
      'email not verified',
      'email confirmation',
      'confirm your email',
      'verify your email',
      'потвердите',
      'проверьте email',
      'email подтвержден',
      'неподтвержден',
      'подтверждение email',
    ];
    
    // Check for specific email confirmation keywords
    return emailNotConfirmedKeywords.some(keyword => lowerMessage.includes(keyword));
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { user } = await authService.login(email, password);
      onSuccess(user);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ошибка входа';
      
      // Check if this is an email confirmation error
      if (isEmailNotConfirmedError(errorMessage)) {
        if (onEmailNotConfirmed) {
          onEmailNotConfirmed(email);
        } else {
          setError(errorMessage);
        }
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} class="auth-form">
      {error && (
        <div class="error-message" style={{ color: 'var(--error)' }}>
          {error}
        </div>
      )}

      <Input
        type="email"
        label="Email"
        id="login-email"
        value={email}
        onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
        required
        autoComplete="email"
        disabled={loading}
      />

      <Input
        type="password"
        label="Пароль"
        id="login-password"
        value={password}
        onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
        required
        autoComplete="current-password"
        disabled={loading}
      />

      <Button type="submit" loading={loading} size="full">
        Войти
      </Button>

      <div style={{ textAlign: 'center' }}>
        <button
          type="button"
          onClick={onSwitchToRegister}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--primary)',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
          disabled={loading}
        >
          Нет аккаунта? Зарегистрироваться
        </button>
      </div>
    </form>
  );
}
