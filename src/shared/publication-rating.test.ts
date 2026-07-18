import { describe, it, expect } from 'vitest';
import {
  computeBayesianRating,
  formatRatingAvg,
  ratingToStarIcons,
  shouldDisplayPublicationRating,
  PUBLICATION_RATING_DISPLAY_THRESHOLD,
} from './publication-rating.js';

describe('publication-rating', () => {
  it('shouldDisplayPublicationRating respects threshold', () => {
    expect(shouldDisplayPublicationRating(PUBLICATION_RATING_DISPLAY_THRESHOLD - 1)).toBe(false);
    expect(shouldDisplayPublicationRating(PUBLICATION_RATING_DISPLAY_THRESHOLD)).toBe(true);
  });

  it('computeBayesianRating pulls cold start toward prior', () => {
    const oneFive = computeBayesianRating(5, 1);
    expect(oneFive).toBeGreaterThan(3.6);
    expect(oneFive).toBeLessThan(5);
  });

  it('formatRatingAvg formats one decimal', () => {
    expect(formatRatingAvg(4.567)).toBe('4.6');
    expect(formatRatingAvg(null)).toBeNull();
  });

  it('ratingToStarIcons returns five icons', () => {
    expect(ratingToStarIcons(4.6).filter((i) => i === 'star').length).toBeGreaterThanOrEqual(4);
    expect(ratingToStarIcons(0)).toHaveLength(5);
  });
});
