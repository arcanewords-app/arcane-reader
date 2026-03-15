import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { Button } from './Button';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  details?: string;
}

export function AlertModal({ isOpen, onClose, title, message, details }: AlertModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      variant="error"
      overlayClassName="error-modal-overlay"
      className="error-modal"
      footer={
        <Button variant="primary" size="sm" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <p>{message}</p>
      {details && <pre class="error-details">{details}</pre>}
    </Modal>
  );
}
