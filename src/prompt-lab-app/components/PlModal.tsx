import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

interface PlModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
  size?: 'default' | 'large' | 'fullscreen';
}

export function PlModal({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'default',
}: PlModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div class="pl-modal-overlay" role="presentation">
      <button type="button" class="pl-modal-backdrop" aria-label="Close dialog" onClick={onClose} />
      <div
        ref={dialogRef}
        class={`pl-modal pl-modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pl-modal-title"
      >
        <header class="pl-modal-header">
          <h2 id="pl-modal-title">{title}</h2>
          <button type="button" class="pl-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div class="pl-modal-body">{children}</div>
        {footer ? <footer class="pl-modal-footer">{footer}</footer> : null}
      </div>
    </div>
  );
}
