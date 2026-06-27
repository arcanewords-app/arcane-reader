import type { ComponentChildren } from 'preact';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { Button } from './Button';
import { Icon } from './Icon';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  details?: string;
  tone?: 'error' | 'success';
}

export function AlertModal({
  isOpen,
  onClose,
  title,
  message,
  details,
  tone = 'error',
}: AlertModalProps) {
  const { t } = useTranslation();

  const footer = (
    <Button variant="primary" size="sm" onClick={onClose}>
      {t('common.close')}
    </Button>
  );

  if (tone === 'success') {
    const successTitle: ComponentChildren = (
      <>
        <Icon name="check_circle" size="sm" />
        <span>{title}</span>
      </>
    );

    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={successTitle}
        className="alert-modal alert-modal--success"
        footer={footer}
      >
        <p class="alert-modal-message">{message}</p>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      variant="error"
      overlayClassName="error-modal-overlay"
      className="error-modal"
      footer={footer}
    >
      <p>{message}</p>
      {details && <pre class="error-details">{details}</pre>}
    </Modal>
  );
}
