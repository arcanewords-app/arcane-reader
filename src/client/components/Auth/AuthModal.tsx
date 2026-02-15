import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { Modal } from '../ui';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { InviteStep } from './InviteStep';
import { authService } from '../../services/authService';
import type { AuthUser } from '../../types';
import './AuthModal.css';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'login' | 'register';
  onSuccess: (user: AuthUser) => void;
  onClose?: () => void;
  onEmailNotConfirmed?: (email: string) => void;
}

type AuthMode = 'login' | 'register';

export function AuthModal({
  isOpen,
  initialMode = 'login',
  onSuccess,
  onClose,
  onEmailNotConfirmed,
}: AuthModalProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [inviteRequired, setInviteRequired] = useState<boolean | null>(null);
  const [inviteVerified, setInviteVerified] = useState(false);
  const [inviteCode, setInviteCode] = useState('');

  // When modal opens, sync tab to initialMode (e.g. "Register" button opened with register tab)
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
    }
  }, [isOpen, initialMode]);

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
      onClose={onClose ?? (() => {})}
      title={
        mode === 'login'
          ? t('auth.loginTitle')
          : showInviteStep
            ? t('auth.registerTitle')
            : t('auth.registerTitle')
      }
      preventClose={false}
      className="auth-modal"
    >
      <>
        <div class="auth-modal-header-row">
          <div class="auth-tabs">
            <button
              type="button"
              onClick={handleSwitchToLogin}
              style={{
                background: 'none',
                border: 'none',
                borderBottom:
                  mode === 'login' ? '2px solid var(--primary)' : '2px solid transparent',
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
          {onClose && (
            <button
              type="button"
              class="auth-modal-close"
              onClick={onClose}
              aria-label={t('common.close')}
            >
              ×
            </button>
          )}
        </div>

        {mode === 'login' ? (
          <LoginForm
            onSuccess={handleSuccess}
            onSwitchToRegister={handleSwitchToRegister}
            onEmailNotConfirmed={onEmailNotConfirmed}
          />
        ) : inviteRequired === null ? (
          <div
            class="auth-form"
            style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}
          >
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

        <div class="auth-modal-footer-links">
          <a href="/privacy" onClick={(e) => { e.preventDefault(); route('/privacy'); }}>
            {t('info.privacy')}
          </a>
          <a href="/terms" onClick={(e) => { e.preventDefault(); route('/terms'); }}>
            {t('info.terms')}
          </a>
        </div>
      </>
    </Modal>
  );
}
