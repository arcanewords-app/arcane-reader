import { describe, expect, it } from 'vitest';
import { computeTocScrollTop } from './tocScroll.js';

describe('computeTocScrollTop', () => {
  const itemHeight = 52;
  const viewportHeight = 400;

  it('returns 0 for negative index', () => {
    expect(computeTocScrollTop(-1, itemHeight, viewportHeight, 100)).toBe(0);
  });

  it('returns 0 when totalItems is 0', () => {
    expect(computeTocScrollTop(0, itemHeight, viewportHeight, 0)).toBe(0);
  });

  it('returns 0 when itemHeight is 0', () => {
    expect(computeTocScrollTop(5, 0, viewportHeight, 100)).toBe(0);
  });

  it('returns 0 for first item (cannot scroll above top)', () => {
    expect(computeTocScrollTop(0, itemHeight, viewportHeight, 100)).toBe(0);
  });

  it('centers a middle item within the viewport', () => {
    const index = 50;
    const expected = index * itemHeight - (viewportHeight - itemHeight) / 2;
    expect(computeTocScrollTop(index, itemHeight, viewportHeight, 100)).toBe(expected);
  });

  it('clamps to maxScroll for last item', () => {
    const totalItems = 100;
    const maxScroll = totalItems * itemHeight - viewportHeight;
    const result = computeTocScrollTop(totalItems - 1, itemHeight, viewportHeight, totalItems);
    expect(result).toBe(maxScroll);
  });

  it('returns 0 when content fits in viewport', () => {
    const totalItems = 5;
    expect(computeTocScrollTop(2, itemHeight, viewportHeight, totalItems)).toBe(0);
  });
});
