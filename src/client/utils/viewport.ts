/** JS viewport breakpoints — align with CSS in variables.css (mobile ≤767, tablet 768–1023). */
export const MOBILE_MAX_PX = 767;
export const TABLET_MAX_PX = 1023;

export const isMobileViewport = (): boolean => window.innerWidth <= MOBILE_MAX_PX;
