import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { route } from 'preact-router';
import type { ChapterListItem, Project, ProjectWithChapterList } from '../../types';
import { buildReadingChapterUrl } from '../../utils/readingRoutes';
import { resolveChapterIndexById, type ReaderChapter } from './readingModeHelpers.js';
import {
  filterProjectReadingChapters,
  isValidChapterIndex,
  resolvePublicationChapters,
  shouldPromptJumpConfirm,
  shouldSkipChapterRoute,
} from './readingChapterNavigation.js';

export interface JumpConfirmState {
  targetIndex: number;
  chapterNumber: number;
}

export interface UseReadingChapterNavigationOptions {
  isPublicationMode: boolean;
  publicationPath?: string;
  publicationId?: string;
  project?: Project | ProjectWithChapterList;
  publicationChapters: Array<{ id: string; number: number; title: string }>;
  initialChapterId?: string;
  lastReadChapterNumber: number;
  onSetProgress?: (chapterNumber: number, mode: 'complete' | 'set') => void;
  lastSyncedParagraphUrlRef: { current: number };
  onAfterChapterSelect?: () => void;
}

export function useReadingChapterNavigation({
  isPublicationMode,
  publicationPath,
  publicationId,
  project,
  publicationChapters,
  initialChapterId,
  lastReadChapterNumber,
  onSetProgress,
  lastSyncedParagraphUrlRef,
  onAfterChapterSelect,
}: UseReadingChapterNavigationOptions) {
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [chapters, setChapters] = useState<ReaderChapter[]>([]);
  const [jumpConfirm, setJumpConfirm] = useState<JumpConfirmState | null>(null);

  const lastInitialChapterIdRef = useRef<string | undefined>(undefined);
  const initialJumpCheckedRef = useRef(false);

  const isOriginalReadingMode =
    !isPublicationMode && (project?.settings?.originalReadingMode ?? false);

  const currentChapter = chapters[currentChapterIndex];

  const syncChapterUrl = useCallback(
    (targetChapterId: string, replace = false) => {
      const url = buildReadingChapterUrl({
        isPublicationMode,
        publicationPath,
        publicationId,
        projectId: project?.id,
        chapterId: targetChapterId,
      });
      const current =
        typeof window !== 'undefined' ? window.location.pathname + window.location.search : '';
      if (shouldSkipChapterRoute(current, url)) return;
      lastSyncedParagraphUrlRef.current = -1;
      route(url as string, replace);
    },
    [isPublicationMode, publicationPath, publicationId, project?.id, lastSyncedParagraphUrlRef]
  );

  const navigateToChapterIndex = useCallback(
    (newIndex: number, options?: { skipJumpConfirm?: boolean }) => {
      if (!isValidChapterIndex(newIndex, chapters.length, currentChapterIndex)) return;
      const targetChapter = chapters[newIndex];
      if (!targetChapter) return;

      if (
        shouldPromptJumpConfirm({
          isPublicationMode,
          hasOnSetProgress: !!onSetProgress,
          targetChapterNumber: targetChapter.number,
          lastReadChapterNumber,
          skipJumpConfirm: options?.skipJumpConfirm,
        })
      ) {
        setJumpConfirm({ targetIndex: newIndex, chapterNumber: targetChapter.number });
        return;
      }

      setCurrentChapterIndex(newIndex);
      syncChapterUrl(targetChapter.id);
    },
    [
      chapters,
      currentChapterIndex,
      isPublicationMode,
      onSetProgress,
      lastReadChapterNumber,
      syncChapterUrl,
    ]
  );

  // Publication mode: set chapters from catalog and initial index
  useEffect(() => {
    if (!isPublicationMode) return;
    const list = resolvePublicationChapters(publicationChapters);
    setChapters(list);
    if (list.length > 0) {
      const syncFromUrl = lastInitialChapterIdRef.current !== initialChapterId;
      if (syncFromUrl) {
        lastInitialChapterIdRef.current = initialChapterId;
        const idx = resolveChapterIndexById(list, initialChapterId);
        setCurrentChapterIndex(idx >= 0 ? idx : 0);
      }
    }
  }, [isPublicationMode, publicationChapters, initialChapterId]);

  // Jump-ahead confirm on direct link to unread chapter
  useEffect(() => {
    if (!isPublicationMode || !onSetProgress || initialJumpCheckedRef.current) return;
    const ch = chapters[currentChapterIndex];
    if (!ch) return;
    initialJumpCheckedRef.current = true;
    if (
      shouldPromptJumpConfirm({
        isPublicationMode: true,
        hasOnSetProgress: true,
        targetChapterNumber: ch.number,
        lastReadChapterNumber,
      })
    ) {
      setJumpConfirm({ targetIndex: currentChapterIndex, chapterNumber: ch.number });
    }
  }, [isPublicationMode, onSetProgress, chapters, currentChapterIndex, lastReadChapterNumber]);

  // Project mode: filter chapters from project
  useEffect(() => {
    if (isPublicationMode || !project) return;

    const projectChapters = project.chapters as ChapterListItem[];
    const availableChapters = filterProjectReadingChapters(projectChapters, isOriginalReadingMode);

    setChapters(availableChapters);
    if (availableChapters.length > 0) {
      const chapterIndex = resolveChapterIndexById(availableChapters, initialChapterId);
      setCurrentChapterIndex(chapterIndex);
    }
  }, [isPublicationMode, project, initialChapterId, isOriginalReadingMode]);

  const handlePrevChapter = useCallback(() => {
    if (currentChapterIndex <= 0) return;
    navigateToChapterIndex(currentChapterIndex - 1);
  }, [currentChapterIndex, navigateToChapterIndex]);

  const handleJumpConfirm = useCallback(() => {
    if (!jumpConfirm) return;
    onSetProgress?.(jumpConfirm.chapterNumber, 'set');
    const target = chapters[jumpConfirm.targetIndex];
    if (target && jumpConfirm.targetIndex !== currentChapterIndex) {
      setCurrentChapterIndex(jumpConfirm.targetIndex);
      syncChapterUrl(target.id);
    }
    setJumpConfirm(null);
  }, [jumpConfirm, onSetProgress, chapters, currentChapterIndex, syncChapterUrl]);

  const handleJumpCancel = useCallback(() => {
    if (!jumpConfirm) return;
    const target = chapters[jumpConfirm.targetIndex];
    if (target && jumpConfirm.targetIndex !== currentChapterIndex) {
      setCurrentChapterIndex(jumpConfirm.targetIndex);
      syncChapterUrl(target.id);
    }
    setJumpConfirm(null);
  }, [jumpConfirm, chapters, currentChapterIndex, syncChapterUrl]);

  const handleSelectChapter = useCallback(
    (index: number) => {
      if (index === currentChapterIndex) {
        onAfterChapterSelect?.();
        return;
      }
      navigateToChapterIndex(index);
      onAfterChapterSelect?.();
      window.scrollTo(0, 0);
    },
    [currentChapterIndex, navigateToChapterIndex, onAfterChapterSelect]
  );

  return {
    chapters,
    setChapters,
    currentChapterIndex,
    setCurrentChapterIndex,
    currentChapter,
    jumpConfirm,
    isOriginalReadingMode,
    syncChapterUrl,
    navigateToChapterIndex,
    handlePrevChapter,
    handleJumpConfirm,
    handleJumpCancel,
    handleSelectChapter,
  };
}
