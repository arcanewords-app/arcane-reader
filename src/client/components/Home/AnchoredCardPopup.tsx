import type { ComponentChildren, RefObject } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { useAnchoredPopup } from '../../hooks/useAnchoredPopup';
import { useIsTruncated } from '../../hooks/useIsTruncated';
import type { AnchoredPopupPlacement } from '../../hooks/anchoredPopupPlacement';
import '../../styles/components/card-content-popup.css';

interface AnchoredCardPopupProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  estimatedHeight: number;
  estimatedWidth: number;
  /** Modifier classes only (`--description`, `--entity`). */
  className?: string;
  id?: string;
  previewRef: RefObject<HTMLElement | null>;
  children: ComponentChildren;
}

function frameStyle(placement: AnchoredPopupPlacement): Record<string, string> {
  return {
    top: placement.top != null ? `${placement.top}px` : 'auto',
    bottom: placement.bottom != null ? `${placement.bottom}px` : 'auto',
    left: placement.left != null ? `${placement.left}px` : 'auto',
    right: placement.right != null ? `${placement.right}px` : 'auto',
    maxWidth: `${placement.maxWidth}px`,
    maxHeight: `${placement.maxHeight}px`,
  };
}

/**
 * Hover preview with fixed coordinates.
 * Portals to `document.body`, or to the surrounding `.modal-overlay` so a dialog
 * (z-index above the page) still shows the bubble without a new viewport layer.
 */
function popupHost(anchor: HTMLElement | null): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const overlay = anchor?.closest('.modal-overlay');
  if (overlay instanceof HTMLElement) return overlay;
  return document.body;
}
export function AnchoredCardPopup({
  open,
  anchorRef,
  estimatedHeight,
  estimatedWidth,
  className = '',
  id,
  previewRef,
  children,
}: AnchoredCardPopupProps) {
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);
  const placement = useAnchoredPopup(anchorRef, open, {
    estimatedHeight,
    estimatedWidth,
    contentHeight,
  });
  const shown = open && placement.anchorVisible;
  const popupRef = useRef<HTMLDivElement>(null);
  const truncated = useIsTruncated(previewRef, shown);

  useLayoutEffect(() => {
    if (!shown) {
      setContentHeight(undefined);
      return;
    }
    const height = popupRef.current?.offsetHeight ?? 0;
    if (height <= 0) return;
    setContentHeight((prev) => (prev == null ? height : prev));
  }, [shown]);

  const host = popupHost(anchorRef.current);
  if (!shown || !host) return null;

  const alignClass =
    placement.horizontal === 'pin'
      ? 'card-content-popup--align-pin'
      : `card-content-popup--align-${placement.horizontal}`;

  return createPortal(
    <div
      id={id}
      ref={popupRef}
      class={[
        'card-content-popup',
        'card-content-popup--fixed',
        `card-content-popup--${placement.vertical}`,
        alignClass,
        truncated ? 'is-truncated' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={frameStyle(placement)}
      role="tooltip"
    >
      {children}
    </div>,
    host
  );
}
