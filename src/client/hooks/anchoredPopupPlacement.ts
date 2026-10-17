export type AnchoredPopupPlacement = {
  vertical: 'above' | 'below';
  horizontal: 'start' | 'end';
};

export const DEFAULT_ANCHORED_PLACEMENT: AnchoredPopupPlacement = {
  vertical: 'above',
  horizontal: 'start',
};

export const VIEWPORT_PADDING = 8;
/** Approximate popup height used before measure (short hint). */
export const ESTIMATED_POPUP_HEIGHT = 140;
/** Avatar row + 12-line entity bio (`card-content-popup--entity`). */
export const ESTIMATED_ENTITY_POPUP_HEIGHT = 320;
/** Max preview height for publication description popups (matches CSS: card-max * 1.75). */
export const ESTIMATED_DESCRIPTION_POPUP_HEIGHT = 490;
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
