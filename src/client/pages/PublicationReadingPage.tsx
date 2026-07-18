import { useEffect, useState, useCallback, useMemo } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { api } from '../api/client';
import { AUTH_CHANGED_EVENT, authService, type AuthChangedDetail } from '../services/authService';
import type { GlossaryEntry } from '../types';
import { usePageMeta } from '../hooks/usePageMeta';
import { ReadingMode } from '../components/ReadingMode';
import { LoadingSpinner } from '../components/ui';
import {
  buildReadingChapterUrl,
  getRawReadingParagraphFromUrl,
  hasReadingParagraphQueryInUrl,
  parseReadingParagraphFromUrl,
  resolveReadingParagraphIndex,
} from '../utils/readingRoutes';
import { advanceWatermarkComplete } from '../../shared/reading-progress';
import './PublicationReadingPage.css';

interface PublicationReadingPageProps {
  publicationId?: string;
  chapterId?: string;
}

export function PublicationReadingPage({ publicationId, chapterId }: PublicationReadingPageProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<{
    publication: {
      id: string;
      title: string | null;
      description: string | null;
      coverImageUrl: string | null;
      slug: string | null;
      authorDisplay?: string | null;
      translatorDisplay?: string | null;
      targetLanguage?: string | null;
    };
    chapters: Array<{ id: string; number: number; title: string; hasTranslation: boolean }>;
    glossaryCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preloadedGlossary, setPreloadedGlossary] = useState<GlossaryEntry[] | null>(null);
  const [initialChapterContent, setInitialChapterContent] = useState<Record<string, string>>({});
  const [lastReadChapterNumber, setLastReadChapterNumber] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [progressLoaded, setProgressLoaded] = useState(false);

  const syncAuthProgress = useCallback(async () => {
    const user = await authService.getCurrentUser();
    setIsAuthenticated(!!user);
    if (!user) {
      setLastReadChapterNumber(0);
      return;
    }
    if (!publicationId) return;
    try {
      const result = await api.getReadProgress(publicationId);
      setLastReadChapterNumber(result.lastReadChapterNumber ?? 0);
    } catch {
      // Ignore progress sync errors on public reader page.
    }
  }, [publicationId]);

  useEffect(() => {
    if (!publicationId) {
      route('/catalog');
      return;
    }
    let cancelled = false;
    api
      .getPublicationWithChapters(publicationId)
      .then((result) => {
        if (!cancelled) {
          setData({
            publication: {
              id: result.id,
              title: result.title,
              description: result.description,
              coverImageUrl: result.coverImageUrl,
              slug: result.slug ?? null,
              authorDisplay: result.authorDisplay,
              translatorDisplay: result.translatorDisplay,
              targetLanguage: result.targetLanguage,
            },
            chapters: result.chapters || [],
            glossaryCount: result.glossaryCount ?? 0,
          });
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [publicationId]);

  useEffect(() => {
    if (!publicationId || !data || (data.glossaryCount ?? 0) <= 0) return;
    let cancelled = false;
    api
      .getPublicationGlossary(publicationId)
      .then((list) => {
        if (!cancelled) setPreloadedGlossary(list);
      })
      .catch(() => {
        if (!cancelled) setPreloadedGlossary([]);
      });
    return () => {
      cancelled = true;
    };
  }, [publicationId, data?.glossaryCount]);

  useEffect(() => {
    if (!publicationId || !data || !chapterId) return;
    const hasTranslation = data.chapters.some((ch) => ch.id === chapterId && ch.hasTranslation);
    if (!hasTranslation) return;

    let cancelled = false;
    api
      .getPublicationChapter(publicationId, chapterId)
      .then((result) => {
        if (!cancelled) {
          setInitialChapterContent((prev) => ({ ...prev, [result.id]: result.translatedText }));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [publicationId, chapterId, data]);

  useEffect(() => {
    if (!publicationId || !chapterId) return;
    const raw = getRawReadingParagraphFromUrl();
    if (raw == null || raw === '') return;
    const parsed = parseReadingParagraphFromUrl();
    if (parsed !== undefined && parsed > 0) return;
    const pubPath = data?.publication.slug ?? publicationId;
    const url = buildReadingChapterUrl({
      isPublicationMode: true,
      publicationPath: pubPath,
      publicationId,
      chapterId,
    });
    if (url && window.location.pathname + window.location.search !== url) {
      route(url, true);
    }
  }, [publicationId, chapterId, data?.publication.slug]);

  useEffect(() => {
    if (!publicationId) return;
    let cancelled = false;
    setProgressLoaded(false);
    syncAuthProgress()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setProgressLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [publicationId, syncAuthProgress]);

  useEffect(() => {
    const handleAuthChanged = (e: CustomEvent<AuthChangedDetail>) => {
      const { authenticated } = e.detail;
      setIsAuthenticated(authenticated);
      if (!authenticated) {
        setLastReadChapterNumber(0);
        return;
      }
      if (!publicationId) return;
      api
        .getReadProgress(publicationId)
        .then((result) => {
          setLastReadChapterNumber(result.lastReadChapterNumber ?? 0);
        })
        .catch(() => {});
    };
    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChanged as EventListener);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChanged as EventListener);
    };
  }, [publicationId]);

  const handleChapterComplete = useCallback(
    (chapterNumber: number) => {
      if (!publicationId) return;
      setLastReadChapterNumber((prev) => advanceWatermarkComplete(prev, chapterNumber));
      api.updateReadProgress(publicationId, chapterNumber, 'complete').catch(() => {
        syncAuthProgress().catch(() => {});
      });
    },
    [publicationId, syncAuthProgress]
  );

  const handleSetProgress = useCallback(
    (chapterNumber: number, mode: 'complete' | 'set') => {
      if (!publicationId) return;
      setLastReadChapterNumber((prev) =>
        mode === 'set' ? chapterNumber : advanceWatermarkComplete(prev, chapterNumber)
      );
      api.updateReadProgress(publicationId, chapterNumber, mode).catch(() => {
        syncAuthProgress().catch(() => {});
      });
    },
    [publicationId, syncAuthProgress]
  );

  const pubPath = data?.publication ? data.publication.slug || data.publication.id : publicationId;
  const publicationChaptersForMeta = data?.chapters?.filter((ch) => ch.hasTranslation) ?? [];
  const currentChapterForMeta = chapterId
    ? data?.chapters?.find((ch) => ch.id === chapterId)
    : publicationChaptersForMeta[0];
  const bookTitleForMeta = data?.publication?.title || t('publication.untitled');
  const chapterTitleForMeta = currentChapterForMeta
    ? currentChapterForMeta.title ||
      t('chapterList.defaultChapterTitle', { number: currentChapterForMeta.number })
    : bookTitleForMeta;
  const readingMeta =
    data?.publication && publicationId
      ? {
          title: currentChapterForMeta
            ? `${chapterTitleForMeta} — ${bookTitleForMeta}`
            : bookTitleForMeta,
          description: currentChapterForMeta
            ? `${chapterTitleForMeta} — ${bookTitleForMeta}`
            : data.publication.description || bookTitleForMeta,
          imageUrl: data.publication.coverImageUrl,
          isChapter: !!currentChapterForMeta,
          authorDisplay: data.publication.authorDisplay,
          translatorDisplay: data.publication.translatorDisplay,
          targetLanguage: data.publication.targetLanguage,
          numberOfPages: (data?.chapters ?? []).length,
          breadcrumbs:
            typeof window !== 'undefined' && publicationId
              ? [
                  { name: t('nav.catalog'), url: `${window.location.origin}/catalog` },
                  {
                    name: data.publication.title || t('publication.untitled'),
                    url: `${window.location.origin}/p/${publicationId}`,
                  },
                  ...(currentChapterForMeta && chapterId
                    ? [
                        {
                          name:
                            currentChapterForMeta.title ||
                            t('chapterList.defaultChapterTitle', {
                              number: currentChapterForMeta.number,
                            }),
                          url: `${window.location.origin}/p/${publicationId}/chapters/${chapterId}/reading`,
                        },
                      ]
                    : []),
                ]
              : undefined,
        }
      : null;
  usePageMeta(readingMeta);

  const publicationChapters = useMemo(
    () =>
      (data?.chapters ?? [])
        .filter((ch) => ch.hasTranslation)
        .map((ch) => ({ id: ch.id, number: ch.number, title: ch.title })),
    [data?.chapters]
  );

  if (!publicationId) return null;

  const waitingForProgress = !progressLoaded;
  if (loading || waitingForProgress) {
    return (
      <div class="publication-reading-placeholder">
        <LoadingSpinner size="lg" text={t('common.loading')} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div class="publication-reading-placeholder">
        <p>{t('publication.notFound')}</p>
        <button type="button" class="publication-reading-back" onClick={() => route('/catalog')}>
          {t('common.back')}
        </button>
      </div>
    );
  }

  if (publicationChapters.length === 0) {
    return (
      <div class="publication-reading-placeholder">
        <p>{t('readingMode.noTranslatedChapters')}</p>
        <button
          type="button"
          class="publication-reading-back"
          onClick={() => route(`/p/${pubPath}`)}
        >
          {t('common.back')}
        </button>
      </div>
    );
  }

  const initialParagraphIndex = resolveReadingParagraphIndex({
    urlHasParagraph: hasReadingParagraphQueryInUrl(),
    urlParagraphIndex: parseReadingParagraphFromUrl(),
  });

  return (
    <ReadingMode
      publicationId={publicationId}
      publicationPath={pubPath}
      publicationTitle={data.publication.title || undefined}
      publicationChapters={publicationChapters}
      publicationGlossaryCount={data.glossaryCount}
      publicationGlossaryPreloaded={preloadedGlossary ?? undefined}
      initialChapterId={chapterId}
      initialChapterContent={
        Object.keys(initialChapterContent).length > 0 ? initialChapterContent : undefined
      }
      initialParagraphIndex={initialParagraphIndex}
      onExit={() => route(`/p/${pubPath}`)}
      onChapterComplete={isAuthenticated ? handleChapterComplete : undefined}
      onSetProgress={isAuthenticated ? handleSetProgress : undefined}
      lastReadChapterNumber={isAuthenticated ? lastReadChapterNumber : 0}
    />
  );
}
