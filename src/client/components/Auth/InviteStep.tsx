import { useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Button, Input } from '../ui';
import { authService } from '../../services/authService';
import './AuthModal.css';

interface InviteStepProps {
  onSuccess: (code: string) => void;
  onSwitchToLogin: () => void;
}

export function InviteStep({ onSuccess, onSwitchToLogin }: InviteStepProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError(null);
    const trimmed = code.trim();
    if (!trimmed) {
      setError(t('auth.inviteCodeRequired'));
      return;
    }
    setLoading(true);
    try {
      await authService.checkInvite(trimmed);
      onSuccess(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.inviteCodeInvalid'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} class="auth-form">
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.95rem' }}>
        {t('auth.inviteCodeHint')}
      </p>
      {error && (
        <div class="error-message" style={{ color: 'var(--error)' }}>
          {error}
        </div>
      )}
      <Input
        type="text"
        label={t('auth.inviteCode')}
        id="invite-code"
        value={code}
        onInput={(e) => setCode((e.target as HTMLInputElement).value)}
        placeholder={t('auth.inviteCodePlaceholder')}
        disabled={loading}
        autoComplete="off"
      />
      <Button type="submit" loading={loading} size="full">
        {t('auth.inviteContinue')}
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
