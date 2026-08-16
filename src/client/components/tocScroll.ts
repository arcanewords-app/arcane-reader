/**
 * Compute scrollTop so the item at `index` is centered in the viewport.
 * Returns 0 when index is missing or invalid.
 */
export function computeTocScrollTop(
  index: number,
  itemHeight: number,
  viewportHeight: number,
  totalItems: number
): number {
  if (index < 0 || totalItems <= 0 || itemHeight <= 0) {
    return 0;
  }
  const contentHeight = totalItems * itemHeight;
  const maxScroll = Math.max(0, contentHeight - viewportHeight);
  const centered = index * itemHeight - (viewportHeight - itemHeight) / 2;
  return Math.min(maxScroll, Math.max(0, centered));
}
