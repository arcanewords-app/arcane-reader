import { useState } from 'preact/hooks';
import { Modal } from '../ui';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import type { AuthUser } from '../../types';

interface AuthModalProps {
  isOpen: boolean;
  onSuccess: (user: AuthUser) => void;
  onEmailNotConfirmed?: (email: string) => void;
}

type AuthMode = 'login' | 'register';

export function AuthModal({ isOpen, onSuccess, onEmailNotConfirmed }: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>('login');

  const handleSuccess = (user: AuthUser) => {
    onSuccess(user);
  };

  const handleSwitchToRegister = () => {
    setMode('register');
  };

  const handleSwitchToLogin = () => {
    setMode('login');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}} // Prevent closing - user must authenticate
      title={mode === 'login' ? 'Вход в систему' : 'Регистрация'}
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
          Вход
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
          Регистрация
        </button>
      </div>

      {mode === 'login' ? (
        <LoginForm
          onSuccess={handleSuccess}
          onSwitchToRegister={handleSwitchToRegister}
          onEmailNotConfirmed={onEmailNotConfirmed}
        />
      ) : (
        <RegisterForm onSuccess={handleSuccess} onSwitchToLogin={handleSwitchToLogin} />
      )}
    </Modal>
  );
}
