import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Return false to prevent closing (e.g. on validation error). */
  onConfirm: () => void | Promise<void | boolean>;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  loading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'default',
  loading = false,
}: ConfirmModalProps) {
  const { t } = useTranslation();

  const handleConfirm = async () => {
    const result = await onConfirm();
    if (result !== false) {
      onClose();
    }
  };

  const confirmBtn = (
    <Button
      variant={variant === 'danger' ? 'destructive' : 'primary'}
      size="sm"
      onClick={handleConfirm}
      disabled={loading}
    >
      {loading ? t('common.loading') : (confirmLabel ?? t('common.ok'))}
    </Button>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      variant="error"
      overlayClassName="error-modal-overlay"
      className="error-modal"
      closeButtonDisabled={loading}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
            {cancelLabel ?? t('common.cancel')}
          </Button>
          {confirmBtn}
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}
