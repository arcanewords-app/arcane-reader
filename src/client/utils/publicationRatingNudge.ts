const RATING_NUDGE_PREFIX = 'arcane.ratingNudge.dismissed.';

export function isRatingNudgeDismissed(publicationId: string): boolean {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(`${RATING_NUDGE_PREFIX}${publicationId}`) === '1';
}

export function dismissRatingNudge(publicationId: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(`${RATING_NUDGE_PREFIX}${publicationId}`, '1');
}
