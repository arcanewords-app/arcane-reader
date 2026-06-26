/**
 * When open chapter content should be refetched (sidebar/project summary ahead of full chapter).
 */

export type ChapterSummaryStatus =
  | 'pending'
  | 'translating'
  | 'analyzed'
  | 'completed'
  | 'partial'
  | 'draft'
  | 'error';

const TERMINAL_STATUSES: ReadonlySet<ChapterSummaryStatus> = new Set([
  'completed',
  'partial',
  'analyzed',
  'draft',
  'error',
]);

export function shouldRefetchOpenChapter(
  openChapterStatus: ChapterSummaryStatus | undefined,
  listItemStatus: ChapterSummaryStatus | undefined
): boolean {
  if (!listItemStatus || !openChapterStatus) return false;
  if (listItemStatus === openChapterStatus) return false;
  if (TERMINAL_STATUSES.has(listItemStatus) && openChapterStatus === 'translating') {
    return true;
  }
  if (TERMINAL_STATUSES.has(listItemStatus) && openChapterStatus === 'pending') {
    return true;
  }
  if (TERMINAL_STATUSES.has(listItemStatus) && TERMINAL_STATUSES.has(openChapterStatus)) {
    return listItemStatus !== openChapterStatus;
  }
  return TERMINAL_STATUSES.has(listItemStatus);
}
