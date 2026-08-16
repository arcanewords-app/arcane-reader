import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ANCHORED_PLACEMENT,
  ESTIMATED_POPUP_HEIGHT,
  ESTIMATED_POPUP_WIDTH,
  computeAnchoredPlacement,
} from './anchoredPopupPlacement.js';

describe('computeAnchoredPlacement', () => {
  it('defaults prefer above/start when space allows', () => {
    expect(
      computeAnchoredPlacement(
        { top: 400, bottom: 420, left: 40, right: 100 },
        { width: 1200, height: 800 }
      )
    ).toEqual(DEFAULT_ANCHORED_PLACEMENT);
  });

  it('flips below when space above is tight and below is larger', () => {
    expect(
      computeAnchoredPlacement(
        { top: 20, bottom: 40, left: 40, right: 100 },
        { width: 1200, height: 800 }
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
});
