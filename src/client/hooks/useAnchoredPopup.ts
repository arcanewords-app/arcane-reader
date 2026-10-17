import { useLayoutEffect, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import {
  DEFAULT_ANCHORED_PLACEMENT,
  computeAnchoredPlacement,
  type AnchoredPopupPlacement,
  type ViewportSize,
} from './anchoredPopupPlacement.js';

export type { AnchoredPopupPlacement } from './anchoredPopupPlacement.js';

/**
 * Fixed-position frame for a popup anchored to `anchorRef`.
 * Re-measures on scroll and resize. `anchorVisible` is false once the anchor
 * has left the visual viewport.
 */
export type UseAnchoredPopupOptions = {
  estimatedHeight?: number;
  estimatedWidth?: number;
};

function readViewport(): ViewportSize {
  const visual = window.visualViewport;
  return {
    width: visual?.width ?? window.innerWidth,
    height: visual?.height ?? window.innerHeight,
    offsetLeft: visual?.offsetLeft ?? 0,
    offsetTop: visual?.offsetTop ?? 0,
    layoutWidth: window.innerWidth,
    layoutHeight: window.innerHeight,
  };
}

function readHeaderInset(): number {
  const header = document.querySelector('.app > header');
  if (!header) return 0;
  return Math.max(0, header.getBoundingClientRect().bottom);
}

export function useAnchoredPopup(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean,
  options?: UseAnchoredPopupOptions
): AnchoredPopupPlacement {
  const [placement, setPlacement] = useState<AnchoredPopupPlacement>(DEFAULT_ANCHORED_PLACEMENT);

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(DEFAULT_ANCHORED_PLACEMENT);
      return;
    }

    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setPlacement(
        computeAnchoredPlacement(
          { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
          readViewport(),
          {
            estimatedHeight: options?.estimatedHeight,
            estimatedWidth: options?.estimatedWidth,
            headerInset: readHeaderInset(),
          }
        )
      );
    };

    update();
    document.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      document.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [anchorRef, open, options?.estimatedHeight, options?.estimatedWidth]);

  return placement;
}
