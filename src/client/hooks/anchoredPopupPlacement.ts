export type AnchoredPopupPlacement = {
  vertical: 'above' | 'below';
  horizontal: 'start' | 'end';
};

export const DEFAULT_ANCHORED_PLACEMENT: AnchoredPopupPlacement = {
  vertical: 'above',
  horizontal: 'start',
};

export const VIEWPORT_PADDING = 8;
/** Approximate popup height used before measure (avatar row + clamped bio). */
export const ESTIMATED_POPUP_HEIGHT = 140;
export const ESTIMATED_POPUP_WIDTH = 280;

export type AnchorRect = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type ViewportSize = {
  width: number;
  height: number;
};

/**
 * Compute above/below + start/end alignment for a popup anchored to a rect.
 */
export function computeAnchoredPlacement(
  rect: AnchorRect,
  viewport: ViewportSize,
  options: {
    padding?: number;
    estimatedHeight?: number;
    estimatedWidth?: number;
  } = {}
): AnchoredPopupPlacement {
  const padding = options.padding ?? VIEWPORT_PADDING;
  const estimatedHeight = options.estimatedHeight ?? ESTIMATED_POPUP_HEIGHT;
  const estimatedWidth = options.estimatedWidth ?? ESTIMATED_POPUP_WIDTH;

  const spaceAbove = rect.top - padding;
  const spaceBelow = viewport.height - rect.bottom - padding;
  const vertical: AnchoredPopupPlacement['vertical'] =
    spaceAbove < estimatedHeight && spaceBelow > spaceAbove ? 'below' : 'above';

  const spaceRight = viewport.width - rect.left - padding;
  const horizontal: AnchoredPopupPlacement['horizontal'] =
    spaceRight < estimatedWidth && rect.right > estimatedWidth ? 'end' : 'start';

  return { vertical, horizontal };
}
