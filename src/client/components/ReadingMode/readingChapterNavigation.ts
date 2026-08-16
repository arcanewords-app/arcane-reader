import type { ChapterListItem } from '../../types';
import { shouldConfirmJumpAhead } from '../../../shared/reading-progress';
import type { ReaderChapter } from './readingModeHelpers.js';

/** Skip `route()` when the address bar already matches the target URL. */
export function shouldSkipChapterRoute(currentUrl: string, nextUrl: string | null): boolean {
  if (!nextUrl) return true;
  return currentUrl === nextUrl;
}

export function shouldPromptJumpConfirm(params: {
  isPublicationMode: boolean;
  hasOnSetProgress: boolean;
  targetChapterNumber: number;
  lastReadChapterNumber: number;
  skipJumpConfirm?: boolean;
}): boolean {
  if (params.skipJumpConfirm) return false;
  if (!params.isPublicationMode || !params.hasOnSetProgress) return false;
  return shouldConfirmJumpAhead(params.targetChapterNumber, params.lastReadChapterNumber);
}

export function isValidChapterIndex(
  newIndex: number,
  chaptersLength: number,
  currentChapterIndex: number
): boolean {
  return newIndex >= 0 && newIndex < chaptersLength && newIndex !== currentChapterIndex;
}

/** Project reading list: original mode shows all; else only translated/draft/partial. */
export function filterProjectReadingChapters(
  projectChapters: ChapterListItem[],
  isOriginalReadingMode: boolean
): ReaderChapter[] {
  if (isOriginalReadingMode) {
    return [...projectChapters].sort((a, b) => a.number - b.number);
  }
  return projectChapters
    .filter(
      (ch) =>
        ch.hasTranslation ||
        ch.status === 'completed' ||
        ch.status === 'draft' ||
        ch.status === 'partial'
    )
    .sort((a, b) => a.number - b.number);
}

export function resolvePublicationChapters(
  publicationChapters: Array<{ id: string; number: number; title: string }>
): ReaderChapter[] {
  return publicationChapters.map((ch) => ({ ...ch }));
}
