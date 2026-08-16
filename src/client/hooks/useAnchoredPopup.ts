import { useLayoutEffect, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import {
  DEFAULT_ANCHORED_PLACEMENT,
  computeAnchoredPlacement,
  type AnchoredPopupPlacement,
} from './anchoredPopupPlacement.js';

export type { AnchoredPopupPlacement } from './anchoredPopupPlacement.js';

/**
 * Compute above/below + start/end alignment for a popup anchored to `anchorRef`.
 * Re-runs when `open` becomes true.
 */
export function useAnchoredPopup(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean
): AnchoredPopupPlacement {
  const [placement, setPlacement] = useState<AnchoredPopupPlacement>(DEFAULT_ANCHORED_PLACEMENT);

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(DEFAULT_ANCHORED_PLACEMENT);
      return;
    }
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    setPlacement(
      computeAnchoredPlacement(
        { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
        { width: window.innerWidth, height: window.innerHeight }
      )
    );
  }, [anchorRef, open]);

  return placement;
}
