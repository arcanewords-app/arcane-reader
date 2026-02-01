import type { JSX } from 'preact';
import { useEffect, useCallback } from 'preact/hooks';
import './Modal.css';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: preact.ComponentChildren;
  footer?: preact.ComponentChildren;
  size?: 'default' | 'large';
  className?: string;
  preventClose?: boolean; // Prevent closing on overlay click or Escape
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'default',
  className = '',
  preventClose = false,
}: ModalProps) {
  // Don't render modal DOM when closed (to avoid layout issues)
  // This check must be at the very beginning to prevent any DOM creation
  if (!isOpen) {
    return null;
  }

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !preventClose) {
        onClose();
      }
    },
    [onClose, preventClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  // Handle overlay click
  const handleOverlayClick = (e: JSX.TargetedMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !preventClose) {
      onClose();
    }
  };

  const isTocModal = className.includes('toc-modal');
  const isLarge = size === 'large';
  const useGlossaryLayout = isLarge && !isTocModal;

  const modalClasses = [
    'modal',
    useGlossaryLayout && 'glossary-modal',
    isTocModal && 'toc-modal',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const overlayClasses = [
    'modal-overlay',
    'active',
    isLarge && 'glossary-modal-overlay',
    className.includes('nested') && 'nested-modal',
    className === 'email-confirmation-modal' && 'email-confirmation-modal-overlay',
  ]
    .filter(Boolean)
    .join(' ');

  const headerContent =
    isTocModal ? (
      <div class="toc-modal-header">
        <h3 class="toc-modal-title">{title}</h3>
        <button type="button" class="modal-close-btn toc-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
    ) : isLarge ? (
      <div class="glossary-modal-header">
        <h3 class="modal-title">{title}</h3>
        <button type="button" class="modal-close-btn" onClick={onClose}>
          ×
        </button>
      </div>
    ) : (
      <h3 class="modal-title">{title}</h3>
    );

  return (
    <div class={overlayClasses} onClick={handleOverlayClick}>
      <div class={modalClasses}>
        {headerContent}

        {children}

        {footer && (
          <div class={isTocModal ? 'toc-modal-footer' : useGlossaryLayout ? 'glossary-modal-footer' : 'form-actions'}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
