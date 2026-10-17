export type AnchoredPopupVertical = 'above' | 'below';
export type AnchoredPopupHorizontal = 'start' | 'end' | 'pin';

export type AnchoredPopupPlacement = {
  vertical: AnchoredPopupVertical;
  horizontal: AnchoredPopupHorizontal;
  /** Fixed box in layout-viewport pixels. One of top/bottom is set. */
  top: number | null;
  bottom: number | null;
  /** One of left/right is set, except both stay null when the anchor is off-screen. */
  left: number | null;
  right: number | null;
  maxWidth: number;
  maxHeight: number;
  anchorVisible: boolean;
};

export const DEFAULT_ANCHORED_PLACEMENT: AnchoredPopupPlacement = {
  vertical: 'above',
  horizontal: 'start',
  top: null,
  bottom: null,
  left: null,
  right: null,
  maxWidth: 0,
  maxHeight: 0,
  anchorVisible: false,
};

export const VIEWPORT_PADDING = 8;
/** Approximate popup height used before measure (short hint). */
export const ESTIMATED_POPUP_HEIGHT = 140;
/** Avatar row + 12-line entity bio (`card-content-popup--entity`). */
export const ESTIMATED_ENTITY_POPUP_HEIGHT = 320;
/** Preferred description preview height before the viewport clamp. */
export const ESTIMATED_DESCRIPTION_POPUP_HEIGHT = 490;
export const ESTIMATED_POPUP_WIDTH = 280;
export const ESTIMATED_DESCRIPTION_POPUP_WIDTH = 320;
export const ESTIMATED_ENTITY_POPUP_WIDTH = 360;

export type AnchorRect = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type ViewportSize = {
  /** Visual viewport width. */
  width: number;
  /** Visual viewport height. */
  height: number;
  offsetLeft?: number;
  offsetTop?: number;
  /** Layout viewport height used for `bottom` on `position: fixed`. */
  layoutHeight?: number;
  /** Layout viewport width used for `right` on `position: fixed`. */
  layoutWidth?: number;
};

function intersectsViewport(rect: AnchorRect, viewport: ViewportSize): boolean {
  const offsetLeft = viewport.offsetLeft ?? 0;
  const offsetTop = viewport.offsetTop ?? 0;
  const visibleLeft = offsetLeft;
  const visibleTop = offsetTop;
  const visibleRight = offsetLeft + viewport.width;
  const visibleBottom = offsetTop + viewport.height;
  return (
    rect.bottom >= visibleTop &&
    rect.top <= visibleBottom &&
    rect.right >= visibleLeft &&
    rect.left <= visibleRight
  );
}

/**
 * Side, fixed coordinates, and viewport clamps for a popup anchored to a rect.
 * The popup may paint outside its card. maxHeight/maxWidth keep it inside the
 * visual viewport so it does not grow the document.
 */
export function computeAnchoredPlacement(
  rect: AnchorRect,
  viewport: ViewportSize,
  options: {
    padding?: number;
    estimatedHeight?: number;
    estimatedWidth?: number;
    /** Measured popup height. Used instead of the estimate when it is smaller. */
    contentHeight?: number;
    /** Bottom of a sticky header, in the same coordinate space as `rect`. */
    headerInset?: number;
  } = {}
): AnchoredPopupPlacement {
  const padding = options.padding ?? VIEWPORT_PADDING;
  const estimatedHeight = options.estimatedHeight ?? ESTIMATED_POPUP_HEIGHT;
  const estimatedWidth = options.estimatedWidth ?? ESTIMATED_POPUP_WIDTH;
  const measuredHeight =
    options.contentHeight != null &&
    options.contentHeight > 0 &&
    options.contentHeight < estimatedHeight
      ? options.contentHeight
      : null;
  const offsetLeft = viewport.offsetLeft ?? 0;
  const offsetTop = viewport.offsetTop ?? 0;
  const layoutHeight = viewport.layoutHeight ?? offsetTop + viewport.height;
  const layoutWidth = viewport.layoutWidth ?? offsetLeft + viewport.width;
  const headerInset = Math.max(offsetTop, options.headerInset ?? 0);
  const anchorVisible = intersectsViewport(rect, viewport);

  const spaceAbove = rect.top - headerInset - padding;
  const spaceBelow = offsetTop + viewport.height - rect.bottom - padding;
  const neededHeight = measuredHeight ?? estimatedHeight;
  const vertical: AnchoredPopupVertical =
    spaceAbove < neededHeight && spaceBelow > spaceAbove ? 'below' : 'above';
  const room = Math.max(0, vertical === 'above' ? spaceAbove : spaceBelow);
  const maxHeight = room;

  const maxBox = Math.min(estimatedWidth, Math.max(0, viewport.width - 2 * padding));
  const roomRight = offsetLeft + viewport.width - rect.left - padding;
  const roomLeft = rect.right - offsetLeft - padding;

  let horizontal: AnchoredPopupHorizontal;
  let left: number | null = null;
  let right: number | null = null;
  let maxWidth: number;

  if (roomRight >= maxBox) {
    horizontal = 'start';
    left = Math.max(rect.left, offsetLeft + padding);
    maxWidth = Math.min(maxBox, offsetLeft + viewport.width - padding - left);
  } else if (roomLeft >= maxBox) {
    horizontal = 'end';
    const rightEdge = Math.min(rect.right, offsetLeft + viewport.width - padding);
    right = layoutWidth - rightEdge;
    maxWidth = Math.min(maxBox, rightEdge - offsetLeft - padding);
  } else {
    horizontal = 'pin';
    left = offsetLeft + padding;
    maxWidth = maxBox;
  }

  const top = vertical === 'below' ? rect.bottom + padding : null;
  const bottom = vertical === 'above' ? layoutHeight - rect.top + padding : null;

  return {
    vertical,
    horizontal,
    top,
    bottom,
    left,
    right,
    maxWidth: Math.max(0, maxWidth),
    maxHeight,
    anchorVisible,
  };
}
