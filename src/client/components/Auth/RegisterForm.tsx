import { useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Button, Input } from '../ui';
import { authService } from '../../services/authService';
import type { AuthUser } from '../../types';

interface RegisterFormProps {
  onSuccess: (user: AuthUser) => void;
  onSwitchToLogin: () => void;
}

export function RegisterForm({ onSuccess, onSwitchToLogin }: RegisterFormProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (password.length < 6) {
      setError(t('auth.passwordMinLength'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('auth.passwordsMismatch'));
      return;
    }

    setLoading(true);

    try {
      // Register user
      await authService.register(email, password);
      
      // Show success message - email confirmation required
      setRegistrationSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errorRegister'));
    } finally {
      setLoading(false);
    }
  };

  if (registrationSuccess) {
    return (
      <div class="auth-form" style={{ textAlign: 'center', padding: '1rem' }}>
        <div style={{ 
          color: 'var(--success, var(--primary))', 
          marginBottom: '1rem',
          fontSize: '1.1rem',
          fontWeight: 'bold'
        }}>
          ✓ {t('auth.registrationSuccess')}
        </div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.6' }} dangerouslySetInnerHTML={{ __html: t('auth.emailSentConfirmation', { email }) }} />
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.6' }}>
          {t('auth.checkEmail')}
        </p>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          {t('auth.afterConfirmLogin')}
        </p>
        <button
          type="button"
          onClick={onSwitchToLogin}
          style={{
            background: 'var(--primary)',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            padding: '0.75rem 1.5rem',
            borderRadius: '4px',
            fontSize: '1rem',
            fontWeight: '500',
          }}
        >
          {t('auth.goToLogin')}
        </button>
      </div>
    );
  }

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
        id="register-email"
        value={email}
        onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
        required
        autoComplete="email"
        disabled={loading}
      />

      <Input
        type="password"
        label={t('auth.password')}
        id="register-password"
        value={password}
        onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
        required
        autoComplete="new-password"
        disabled={loading}
        minLength={6}
      />

      <Input
        type="password"
        label={t('auth.confirmPassword')}
        id="register-confirm-password"
        value={confirmPassword}
        onInput={(e) => setConfirmPassword((e.target as HTMLInputElement).value)}
        required
        autoComplete="new-password"
        disabled={loading}
        minLength={6}
      />

      <Button type="submit" loading={loading} size="full">
        {t('auth.submitRegister')}
      </Button>

      <div style={{ textAlign: 'center' }}>
        <button
          type="button"
          onClick={onSwitchToLogin}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--primary)',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
          disabled={loading}
        >
          {t('auth.haveAccountLogin')}
        </button>
      </div>
    </form>
  );
}
