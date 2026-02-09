import type { JSX } from 'preact';
import { useEffect, useCallback } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import './Modal.css';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: preact.ComponentChildren;
  footer?: preact.ComponentChildren;
  size?: 'default' | 'large';
  className?: string;
  /** Optional class for the overlay (e.g. error-modal-overlay for confirm/error modals) */
  overlayClassName?: string;
  /** When 'error', uses error-modal-header/body/footer structure (for confirm dialogs, alerts) */
  variant?: 'default' | 'large' | 'toc' | 'error';
  preventClose?: boolean; // Prevent closing on overlay click or Escape
  /** Disable the header close button (e.g. while submitting in confirm modal) */
  closeButtonDisabled?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'default',
  className = '',
  overlayClassName = '',
  variant,
  preventClose = false,
  closeButtonDisabled = false,
}: ModalProps) {
  const effectiveVariant =
    variant ??
    (className.includes('toc-modal')
      ? 'toc'
      : className.includes('error-modal')
        ? 'error'
        : size === 'large'
          ? 'large'
          : 'default');

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !preventClose) {
        onClose();
      }
    },
    [onClose, preventClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) {
    return null;
  }

  // Handle overlay click
  const handleOverlayClick = (e: JSX.TargetedMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !preventClose) {
      onClose();
    }
  };

  const isTocModal = effectiveVariant === 'toc';
  const isErrorVariant = effectiveVariant === 'error';
  const isLarge = size === 'large' || effectiveVariant === 'large';
  const useGlossaryLayout = isLarge && !isTocModal;

  const modalClasses = [
    'modal',
    useGlossaryLayout && 'glossary-modal',
    isTocModal && 'toc-modal',
    isErrorVariant && 'error-modal',
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
    overlayClassName,
  ]
    .filter(Boolean)
    .join(' ');

  const headerContent = isErrorVariant ? (
    <div class="error-modal-header">
      <h3>{title}</h3>
      <button
        type="button"
        class="error-modal-close"
        onClick={onClose}
        aria-label="Close"
        disabled={closeButtonDisabled}
      >
        ×
      </button>
    </div>
  ) : isTocModal ? (
    <div class="toc-modal-header">
      <h3 class="toc-modal-title">{title}</h3>
      <button
        type="button"
        class="modal-close-btn toc-modal-close"
        onClick={onClose}
        aria-label="Close"
      >
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
    <div class="modal-header-row">
      <h3 class="modal-title">{title}</h3>
      <button
        type="button"
        class="modal-close-btn"
        onClick={onClose}
        aria-label="Close"
        disabled={closeButtonDisabled}
      >
        ×
      </button>
    </div>
  );

  const footerWrapperClass = isErrorVariant
    ? 'error-modal-footer'
    : isTocModal
      ? 'toc-modal-footer'
      : useGlossaryLayout
        ? 'glossary-modal-footer'
        : 'form-actions';

  const content = (
    <div
      class={overlayClasses}
      role="button"
      tabIndex={0}
      aria-label="Close modal"
      onClick={handleOverlayClick}
      onKeyDown={(e) => {
        // Only close on Space/Enter when focus is on the overlay (clicked backdrop), not when
        // focus is inside modal content (e.g. Space in glossary card would close otherwise)
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && !preventClose) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div class={modalClasses}>
        {headerContent}

        {isErrorVariant ? <div class="error-modal-body">{children}</div> : children}

        {footer && <div class={footerWrapperClass}>{footer}</div>}
      </div>
    </div>
  );

  // Render into document.body so position:fixed is relative to viewport (avoids
  // stacking-context/transform issues in sidebar and works on mobile + desktop)
  return createPortal(content, document.body);
}
