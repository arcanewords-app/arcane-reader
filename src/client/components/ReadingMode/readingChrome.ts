/** Pure chrome (header/footer) visibility FSM for ReadingMode scroll. */

export const SCROLL_THRESHOLD = 50;
export const SCROLL_UP_THRESHOLD = 50;
export const EDGE_THRESHOLD = 100;

export type ChromeScrollInput = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  delta: number;
  scrollAccum: number;
  scrollUpAccum: number;
  menuVisible: boolean;
  edgeThreshold?: number;
  scrollThreshold?: number;
  scrollUpThreshold?: number;
};

export type ChromeScrollResult = {
  menuVisible: boolean;
  isNearTop: boolean;
  isNearBottom: boolean;
  scrollAccum: number;
  scrollUpAccum: number;
  /** True when menu was hidden this tick (caller may hide settings). */
  didHideMenu: boolean;
};

export function computeNearEdges(params: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  edgeThreshold?: number;
}): { isNearTop: boolean; isNearBottom: boolean } {
  const edge = params.edgeThreshold ?? EDGE_THRESHOLD;
  const isNearTop = params.scrollTop <= edge;
  const isNearBottom =
    params.scrollHeight <= params.clientHeight ||
    params.scrollTop + params.clientHeight >= params.scrollHeight - edge;
  return { isNearTop, isNearBottom };
}

export function computeChromeFromScroll(input: ChromeScrollInput): ChromeScrollResult {
  const scrollThreshold = input.scrollThreshold ?? SCROLL_THRESHOLD;
  const scrollUpThreshold = input.scrollUpThreshold ?? SCROLL_UP_THRESHOLD;
  const { isNearTop, isNearBottom } = computeNearEdges(input);

  let menuVisible = input.menuVisible;
  let scrollAccum = input.scrollAccum;
  let scrollUpAccum = input.scrollUpAccum;
  let didHideMenu = false;

  if (input.delta > 0) {
    scrollUpAccum = 0;
    scrollAccum += input.delta;
    if (scrollAccum > scrollThreshold) {
      menuVisible = false;
      didHideMenu = true;
      scrollAccum = 0;
    }
  } else if (input.delta < 0) {
    scrollAccum = 0;
    scrollUpAccum += Math.abs(input.delta);
    if (scrollUpAccum > scrollUpThreshold) {
      menuVisible = true;
      scrollUpAccum = 0;
    }
  }

  return {
    menuVisible,
    isNearTop,
    isNearBottom,
    scrollAccum,
    scrollUpAccum,
    didHideMenu,
  };
}

export function computeChromeVisibility(params: {
  menuVisible: boolean;
  isNearTop: boolean;
  isNearBottom: boolean;
}): { headerVisible: boolean; footerVisible: boolean } {
  return {
    headerVisible: params.menuVisible || params.isNearTop,
    footerVisible: params.menuVisible || params.isNearBottom,
  };
}
