import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Modal } from '../ui';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { InviteStep } from './InviteStep';
import { authService } from '../../services/authService';
import type { AuthUser } from '../../types';
import './AuthModal.css';

interface AuthModalProps {
  isOpen: boolean;
  onSuccess: (user: AuthUser) => void;
  onEmailNotConfirmed?: (email: string) => void;
}

type AuthMode = 'login' | 'register';

export function AuthModal({ isOpen, onSuccess, onEmailNotConfirmed }: AuthModalProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<AuthMode>('login');
  const [inviteRequired, setInviteRequired] = useState<boolean | null>(null);
  const [inviteVerified, setInviteVerified] = useState(false);
  const [inviteCode, setInviteCode] = useState('');

  useEffect(() => {
    if (mode === 'register' && inviteRequired === null) {
      authService.isInviteRequired().then(setInviteRequired);
    }
  }, [mode, inviteRequired]);

  const handleSuccess = (user: AuthUser) => {
    onSuccess(user);
  };

  const handleSwitchToRegister = () => {
    setMode('register');
  };

  const handleSwitchToLogin = () => {
    setMode('login');
    setInviteVerified(false);
    setInviteCode('');
  };

  const handleInviteSuccess = (code: string) => {
    setInviteVerified(true);
    setInviteCode(code);
  };

  const showInviteStep = mode === 'register' && inviteRequired === true && !inviteVerified;
  const showRegisterForm = mode === 'register' && (inviteRequired === false || inviteVerified);
  const registerInviteCode = inviteVerified ? inviteCode : undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}}
      title={
        mode === 'login'
          ? t('auth.loginTitle')
          : showInviteStep
            ? t('auth.registerTitle')
            : t('auth.registerTitle')
      }
      preventClose={true}
      className="auth-modal"
    >
      <div class="auth-tabs">
        <button
          type="button"
          onClick={handleSwitchToLogin}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: mode === 'login' ? '2px solid var(--primary)' : '2px solid transparent',
            color: mode === 'login' ? 'var(--primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '0.5rem 1rem',
            fontWeight: mode === 'login' ? 'bold' : 'normal',
          }}
        >
          {t('auth.login')}
        </button>
        <button
          type="button"
          onClick={handleSwitchToRegister}
          style={{
            background: 'none',
            border: 'none',
            borderBottom:
              mode === 'register' ? '2px solid var(--primary)' : '2px solid transparent',
            color: mode === 'register' ? 'var(--primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '0.5rem 1rem',
            fontWeight: mode === 'register' ? 'bold' : 'normal',
          }}
        >
          {t('auth.register')}
        </button>
      </div>

      {mode === 'login' ? (
        <LoginForm
          onSuccess={handleSuccess}
          onSwitchToRegister={handleSwitchToRegister}
          onEmailNotConfirmed={onEmailNotConfirmed}
        />
      ) : inviteRequired === null ? (
        <div class="auth-form" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          {t('auth.loading')}
        </div>
      ) : showInviteStep ? (
        <InviteStep onSuccess={handleInviteSuccess} onSwitchToLogin={handleSwitchToLogin} />
      ) : showRegisterForm ? (
        <RegisterForm
          onSuccess={handleSuccess}
          onSwitchToLogin={handleSwitchToLogin}
          invitationCode={registerInviteCode}
        />
      ) : null}
    </Modal>
  );
}
