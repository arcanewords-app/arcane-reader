import { Modal, Button } from '../ui';

interface EmailConfirmationModalProps {
  isOpen: boolean;
  email: string;
  onClose: () => void;
}

export function EmailConfirmationModal({ isOpen, email, onClose }: EmailConfirmationModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Подтвердите email"
      className="email-confirmation-modal"
    >
      <div class="auth-form" style={{ textAlign: 'center', padding: '0.5rem 0' }}>
        {/* Icon */}
        <div
          style={{
            fontSize: '2.5rem',
            marginBottom: '1rem',
            lineHeight: 1,
            filter: 'drop-shadow(0 2px 8px rgba(139, 92, 246, 0.3))',
          }}
        >
          📧
        </div>

        {/* Title */}
        <h3
          style={{
            marginBottom: '0.75rem',
            color: 'var(--text-primary)',
            fontSize: '1.25rem',
            fontWeight: '600',
            background: 'linear-gradient(135deg, var(--text-primary) 0%, var(--accent) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Требуется подтверждение email
        </h3>

        {/* Main message */}
        <p
          style={{
            color: 'var(--text-secondary)',
            marginBottom: '1rem',
            lineHeight: '1.5',
            fontSize: '0.95rem',
          }}
        >
          На ваш email{' '}
          <strong style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{email}</strong> было
          отправлено письмо для подтверждения аккаунта.
        </p>

        {/* Instructions */}
        <div
          style={{
            background:
              'linear-gradient(135deg, var(--bg-secondary) 0%, rgba(18, 18, 26, 0.6) 100%)',
            border: '1px solid var(--border)',
            padding: '1rem',
            borderRadius: '10px',
            marginBottom: '1rem',
          }}
        >
          <p
            style={{
              margin: 0,
              color: 'var(--text-secondary)',
              fontSize: '0.9rem',
              lineHeight: '1.5',
            }}
          >
            Пожалуйста, проверьте вашу почту и перейдите по ссылке из письма для активации аккаунта.
          </p>
        </div>

        {/* Note */}
        <p
          style={{
            color: 'var(--text-dim)',
            marginBottom: '1rem',
            lineHeight: '1.5',
            fontSize: '0.85rem',
          }}
        >
          После подтверждения email вы сможете войти в систему.
        </p>

        {/* Button */}
        <Button onClick={onClose} size="full">
          Понятно
        </Button>
      </div>
    </Modal>
  );
}
