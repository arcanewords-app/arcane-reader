/**
 * CSS-pixel viewports for visual E2E. Align with src/client/utils/viewport.ts:
 * mobile ≤767, tablet 768–1023, desktop ≥1024. Do not import from src/client.
 * Tablet is 834 (inside the band) — never shoot on the 768 boundary.
 * deviceScaleFactor stays 1 (Playwright scale: 'css') — not retina device presets.
 */
export const LAYOUT_VIEWPORTS = [
  { id: 'desktop', width: 1280, height: 720 },
  { id: 'tablet', width: 834, height: 1112 },
  { id: 'phone', width: 390, height: 844 },
] as const;

export type LayoutViewportId = (typeof LAYOUT_VIEWPORTS)[number]['id'];
