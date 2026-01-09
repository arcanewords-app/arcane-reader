import type { JSX } from 'preact';
import { useEffect, useCallback } from 'preact/hooks';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: preact.ComponentChildren;
  footer?: preact.ComponentChildren;
  size?: 'default' | 'large';
  className?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'default',
  className = '',
}: ModalProps) {
  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  // Handle overlay click
  const handleOverlayClick = (e: JSX.TargetedMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const modalClasses = [
    'modal',
    size === 'large' && 'glossary-modal',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const overlayClasses = [
    'modal-overlay',
    isOpen && 'active',
    size === 'large' && 'glossary-modal-overlay',
    className.includes('nested') && 'nested-modal',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div class={overlayClasses} onClick={handleOverlayClick}>
      <div class={modalClasses}>
        {size === 'large' ? (
          <div class="glossary-modal-header">
            <h3 class="modal-title">{title}</h3>
            <button class="modal-close-btn" onClick={onClose}>
              ×
            </button>
          </div>
        ) : (
          <h3 class="modal-title">{title}</h3>
        )}
        
        {children}
        
        {footer && (
          <div class={size === 'large' ? 'glossary-modal-footer' : 'form-actions'}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

