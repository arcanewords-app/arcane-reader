/** Minimum votes before showing aggregate on catalog cards. */
export const PUBLICATION_RATING_DISPLAY_THRESHOLD = 5;

/** Bayesian prior mean (neutral-ish for fan translations). */
export const PUBLICATION_RATING_PRIOR_MEAN = 3.6;

/** Bayesian prior weight (matches display threshold). */
export const PUBLICATION_RATING_PRIOR_WEIGHT = 5;

export function computeBayesianRating(sum: number, count: number): number {
  if (count <= 0) return PUBLICATION_RATING_PRIOR_MEAN;
  return (
    (PUBLICATION_RATING_PRIOR_WEIGHT * PUBLICATION_RATING_PRIOR_MEAN + sum) /
    (PUBLICATION_RATING_PRIOR_WEIGHT + count)
  );
}

export function shouldDisplayPublicationRating(count: number | null | undefined): boolean {
  return (count ?? 0) >= PUBLICATION_RATING_DISPLAY_THRESHOLD;
}

export function formatRatingAvg(avg: number | null | undefined): string | null {
  if (avg == null || Number.isNaN(avg)) return null;
  return avg.toFixed(1);
}

/** Star fill state for display row (1-5 scale). */
export function ratingToStarIcons(avg: number): Array<'star' | 'star_half' | 'star_border'> {
  const clamped = Math.max(0, Math.min(5, avg));
  const full = Math.floor(clamped);
  const hasHalf = clamped - full >= 0.25 && clamped - full < 0.75;
  const roundUp = clamped - full >= 0.75;
  const fullStars = full + (roundUp ? 1 : 0);
  const icons: Array<'star' | 'star_half' | 'star_border'> = [];
  for (let i = 0; i < 5; i++) {
    if (i < fullStars) icons.push('star');
    else if (i === fullStars && hasHalf && !roundUp) icons.push('star_half');
    else icons.push('star_border');
  }
  return icons;
}
