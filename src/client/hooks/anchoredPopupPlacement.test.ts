import { describe, expect, it } from 'vitest';
import {
  ESTIMATED_POPUP_HEIGHT,
  ESTIMATED_POPUP_WIDTH,
  ESTIMATED_DESCRIPTION_POPUP_HEIGHT,
  ESTIMATED_ENTITY_POPUP_WIDTH,
  VIEWPORT_PADDING,
  computeAnchoredPlacement,
} from './anchoredPopupPlacement.js';

describe('computeAnchoredPlacement', () => {
  it('defaults prefer above/start when space allows', () => {
    const placement = computeAnchoredPlacement(
      { top: 400, bottom: 420, left: 40, right: 100 },
      { width: 1200, height: 800 }
    );
    expect(placement.vertical).toBe('above');
    expect(placement.horizontal).toBe('start');
    expect(placement.anchorVisible).toBe(true);
    expect(placement.maxHeight).toBe(400 - VIEWPORT_PADDING);
    expect(placement.left).toBe(40);
    expect(placement.bottom).toBe(800 - 400 + VIEWPORT_PADDING);
  });

  it('flips below when space above is tight and below is larger', () => {
    expect(
      computeAnchoredPlacement(
        { top: 20, bottom: 40, left: 40, right: 100 },
        { width: 1200, height: 800 }
      ).vertical
    ).toBe('below');
  });

  it('flips below for description popup when anchor is near top of viewport', () => {
    expect(
      computeAnchoredPlacement(
        { top: 20, bottom: 40, left: 40, right: 100 },
        { width: 1200, height: 800 },
        { estimatedHeight: ESTIMATED_DESCRIPTION_POPUP_HEIGHT }
      ).vertical
    ).toBe('below');
  });

  it('keeps above when space above is enough', () => {
    expect(
      computeAnchoredPlacement(
        {
          top: ESTIMATED_POPUP_HEIGHT + 50,
          bottom: ESTIMATED_POPUP_HEIGHT + 70,
          left: 40,
          right: 100,
        },
        { width: 1200, height: 800 }
      ).vertical
    ).toBe('above');
  });

  it('aligns end near the right edge', () => {
    const viewportWidth = 1000;
    expect(
      computeAnchoredPlacement(
        {
          top: 400,
          bottom: 420,
          left: viewportWidth - 40,
          right: viewportWidth - 10,
        },
        { width: viewportWidth, height: 800 }
      ).horizontal
    ).toBe('end');
  });

  it('keeps start when enough space on the right', () => {
    expect(
      computeAnchoredPlacement(
        { top: 400, bottom: 420, left: 10, right: 80 },
        { width: ESTIMATED_POPUP_WIDTH + 200, height: 800 }
      ).horizontal
    ).toBe('start');
  });

  it('clamps maxHeight to the free side and the sticky header', () => {
    const placement = computeAnchoredPlacement(
      { top: 600, bottom: 620, left: 40, right: 100 },
      { width: 1200, height: 800 },
      { estimatedHeight: ESTIMATED_DESCRIPTION_POPUP_HEIGHT, headerInset: 72 }
    );
    expect(placement.vertical).toBe('above');
    expect(placement.maxHeight).toBe(600 - 72 - VIEWPORT_PADDING);
  });

  it('opens below the last card when that side has more room', () => {
    const placement = computeAnchoredPlacement(
      { top: 80, bottom: 100, left: 16, right: 280 },
      { width: 390, height: 700 },
      { estimatedHeight: ESTIMATED_DESCRIPTION_POPUP_HEIGHT }
    );
    expect(placement.vertical).toBe('below');
    expect(placement.top).toBe(100 + VIEWPORT_PADDING);
    expect(placement.maxHeight).toBe(700 - 100 - VIEWPORT_PADDING);
  });

  it('pins and shrinks when the popup is wider than the viewport', () => {
    const placement = computeAnchoredPlacement(
      { top: 200, bottom: 220, left: 20, right: 80 },
      { width: 300, height: 700 },
      { estimatedWidth: ESTIMATED_ENTITY_POPUP_WIDTH }
    );
    expect(placement.horizontal).toBe('pin');
    expect(placement.left).toBe(VIEWPORT_PADDING);
    expect(placement.maxWidth).toBe(300 - 2 * VIEWPORT_PADDING);
  });

  it('hides when the anchor has left the viewport', () => {
    const placement = computeAnchoredPlacement(
      { top: -120, bottom: -40, left: 40, right: 100 },
      { width: 1200, height: 800 }
    );
    expect(placement.anchorVisible).toBe(false);
  });
});
