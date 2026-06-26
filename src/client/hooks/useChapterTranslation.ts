import { useState, useEffect, useCallback } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { authService } from '../services/authService';
import { resolveChapterSourceTextLengthFromOptions } from '../../shared/chapterSourceText.js';
import { estimateChapterTranslationTokensForProject } from '../config/tokenEstimate';
import { useTokenLimitCheck } from './useTokenLimitCheck';
import type { Chapter, Project, ChapterTranslationOptions } from '../types';

export type { ChapterTranslationOptions } from '../types';

/**
 * Hook: start chapter translation with token limit check.
 * Caller is responsible for polling chapter status (e.g. when chapter.status === 'translating').
 */
export function useChapterTranslation(
  projectId: string,
  chapterId: string,
  chapter: Chapter,
  project: Project,
  onChapterUpdate: (chapter: Chapter) => void,
  onError?: (title: string, message: string) => void
) {
  const { t } = useTranslation();
  const [translating, setTranslating] = useState(false);

  const {
    tokenUsage,
    checkBeforeTranslate,
    warningState,
    closeWarning,
    confirmAndProceed,
    loadTokenUsage,
  } = useTokenLimitCheck();

  const estimateForOptions = useCallback(
    (options: ChapterTranslationOptions = {}) => {
      const textLength = resolveChapterSourceTextLengthFromOptions(chapter, {
        paragraphIds: options.paragraphIds,
        translateOnlyEmpty: options.translateOnlyEmpty,
      });
      return estimateChapterTranslationTokensForProject(project, chapter, {
        textLength,
        stages: options.stages ?? 'all',
        translateChapterTitles: options.translateChapterTitles,
      });
    },
    [chapter, project]
  );

  // Clear local translating when chapter status is no longer translating (e.g. after polling)
  useEffect(() => {
    if (chapter.status !== 'translating') {
      setTranslating(false);
    }
  }, [chapter.status]);

  const startTranslation = useCallback(
    (options: ChapterTranslationOptions = {}) => {
      if (chapter.status === 'translating' || translating) {
        return;
      }
      const estimated = estimateForOptions(options);

      checkBeforeTranslate(estimated, () => {
        setTranslating(true);
        api
          .translateChapter(projectId, chapterId, options)
          .then(() => {
            onChapterUpdate({ ...chapter, status: 'translating' });
            if (authService.isAuthenticated()) {
              loadTokenUsage();
            }
          })
          .catch((error: { status?: number; data?: { message?: string }; message?: string }) => {
            setTranslating(false);
            if (error?.status === 429) {
              const errorData = error.data || {};
              const msg = t('tokenLimit.exceededMessage', {
                message: errorData.message || t('tokenLimit.dailyExhaustedShort'),
              });
              if (onError) {
                onError(t('tokenLimit.titleExceeded'), msg);
              } else {
                alert(msg);
              }
              if (authService.isAuthenticated()) loadTokenUsage();
              return;
            }
            onChapterUpdate({ ...chapter, status: 'error' });
            const errorMessage = error instanceof Error ? error.message : t('errors.unknown');
            const fullMsg = `${t('errors.startTranslation')}: ${errorMessage}`;
            if (onError) {
              onError(t('errors.startTranslation'), fullMsg);
            } else {
              alert(fullMsg);
            }
          });
      });
    },
    [
      projectId,
      chapterId,
      chapter,
      translating,
      estimateForOptions,
      checkBeforeTranslate,
      onChapterUpdate,
      loadTokenUsage,
      onError,
      t,
    ]
  );

  return {
    startTranslation,
    translating: translating || chapter.status === 'translating',
    estimateForOptions,
    tokenUsage,
    warningState,
    closeWarning,
    confirmAndProceed,
    loadTokenUsage,
  };
}
