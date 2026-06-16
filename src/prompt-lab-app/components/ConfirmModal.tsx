import { PlModal } from './PlModal';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <PlModal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <div class="pl-row">
          <button type="button" class="pl-btn secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            class={`pl-btn${danger ? ' danger' : ''}`}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <p>{message}</p>
    </PlModal>
  );
}
