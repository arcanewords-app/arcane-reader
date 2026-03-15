import { useState, useEffect, useCallback } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { authService } from '../services/authService';
import { isChunkError } from '../../shared/chunkErrors';
import { useTokenEstimate } from './useTokenEstimate';
import { useTokenLimitCheck } from './useTokenLimitCheck';
import type { Chapter, Paragraph, Project, ChapterTranslationOptions } from '../types';

export type { ChapterTranslationOptions } from '../types';

/**
 * Get text length for token estimation based on chapter and translation options.
 */
function getTextLengthForOptions(chapter: Chapter, options: ChapterTranslationOptions): number {
  if (options.paragraphIds?.length && chapter.paragraphs?.length) {
    const idSet = new Set(options.paragraphIds);
    return chapter.paragraphs
      .filter((p) => idSet.has(p.id))
      .reduce((sum, p) => sum + p.originalText.length, 0);
  }
  if (options.translateOnlyEmpty && chapter.paragraphs?.length) {
    const hasValidTranslation = (p: Paragraph) => {
      const t = p.translatedText?.trim() || '';
      if (!t.length) return false;
      if (t.startsWith('❌') || isChunkError(t)) return false;
      return true;
    };
    const empty = chapter.paragraphs.filter((p) => !hasValidTranslation(p));
    return empty.reduce((sum, p) => sum + p.originalText.length, 0);
  }
  return chapter.originalText?.length ?? 0;
}

/**
 * Hook: start chapter translation with token limit check.
 * Uses useTokenEstimate and useTokenLimitCheck internally.
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

  const estimate = useTokenEstimate();
  const {
    tokenUsage,
    checkBeforeTranslate,
    warningState,
    closeWarning,
    confirmAndProceed,
    loadTokenUsage,
  } = useTokenLimitCheck();

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
      const textLength = getTextLengthForOptions(chapter, options);
      const estimated = estimate(textLength);

      checkBeforeTranslate(estimated, () => {
        setTranslating(true);
        const body: Parameters<typeof api.translateChapter>[2] = {};
        if (options.paragraphIds?.length) {
          body.paragraphIds = options.paragraphIds;
        } else if (options.translateOnlyEmpty) {
          body.translateOnlyEmpty = true;
        }
        if (options.stages !== undefined) {
          body.stages = options.stages;
        }

        api
          .translateChapter(projectId, chapterId, body)
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
      estimate,
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
    estimate,
    tokenUsage,
    warningState,
    closeWarning,
    confirmAndProceed,
    loadTokenUsage,
  };
}
