import { useEffect, useState, useCallback, useMemo } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { api } from '../api/client';
import { AUTH_CHANGED_EVENT, authService } from '../services/authService';
import type { GlossaryEntry } from '../types';
import { usePageMeta } from '../hooks/usePageMeta';
import { ReadingMode } from '../components/ReadingMode';
import { LoadingSpinner } from '../components/ui';
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
    };
    chapters: Array<{ id: string; number: number; title: string; hasTranslation: boolean }>;
    glossaryCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preloadedGlossary, setPreloadedGlossary] = useState<GlossaryEntry[] | null>(null);
  const [initialChapterContent, setInitialChapterContent] = useState<Record<string, string>>({});
  const [readChapterIds, setReadChapterIds] = useState<Set<string>>(new Set());
  const [lastReadChapterId, setLastReadChapterId] = useState<string | null>(null);
  const [lastReadParagraphIndex, setLastReadParagraphIndex] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [progressLoaded, setProgressLoaded] = useState(false);

  const syncAuthProgress = useCallback(async () => {
    setProgressLoaded(false);
    const user = await authService.getCurrentUser();
    setIsAuthenticated(!!user);
    if (!user || !chapterId) {
      setReadChapterIds(new Set());
      setLastReadChapterId(null);
      setLastReadParagraphIndex(0);
      setProgressLoaded(true);
      return;
    }
    if (!publicationId) {
      setProgressLoaded(true);
      return;
    }
    try {
      const result = await api.getReadProgress(publicationId);
      setReadChapterIds(new Set(result.chapterIds));
      setLastReadChapterId(result.lastReadChapterId ?? null);
      setLastReadParagraphIndex(result.lastReadParagraphIndex ?? 0);
    } catch {
      // Ignore progress sync errors on public reader page.
    } finally {
      setProgressLoaded(true);
    }
  }, [chapterId, publicationId]);

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

  // Preload glossary in background when publication has glossary entries
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when publicationId or glossaryCount changes
  }, [publicationId, data?.glossaryCount]);

  // Preload initial chapter content when opening a specific chapter (ensures fetch happens with initial load)
  useEffect(() => {
    if (!publicationId || !data || !chapterId) return;
    const hasTranslation = data.chapters.some((ch) => ch.id === chapterId && ch.hasTranslation);
    if (!hasTranslation) return;

    let cancelled = false;
    api
      .getPublicationChapter(publicationId, chapterId)
      .then((result) => {
        if (!cancelled) {
          setInitialChapterContent({ [result.id]: result.translatedText });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [publicationId, chapterId, data?.chapters]);

  // Check auth and load read progress for authenticated users
  useEffect(() => {
    let cancelled = false;
    syncAuthProgress().catch(() => {});
    const handleAuthChanged = () => {
      if (cancelled) return;
      syncAuthProgress().catch(() => {});
    };
    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
    };
  }, [syncAuthProgress]);

  const handleChapterRead = useCallback(
    (chapterId: string) => {
      if (!publicationId) return;
      setReadChapterIds((prev) => new Set([...prev, chapterId]));
      api.markChapterAsRead(publicationId, chapterId).catch(() => {});
    },
    [publicationId]
  );

  const handleSavePosition = useCallback(
    (chId: string, paragraphIndex: number) => {
      if (!publicationId || !isAuthenticated) return;
      api.updateReadingPosition(publicationId, chId, paragraphIndex).catch(() => {});
    },
    [publicationId, isAuthenticated]
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- data.chapters identity stable after load
    [data?.chapters]
  );

  if (!publicationId) return null;

  const waitingForProgress = chapterId && !progressLoaded;
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

  const initialParagraphIndex =
    chapterId && chapterId === lastReadChapterId ? lastReadParagraphIndex : undefined;

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
      onChapterRead={isAuthenticated ? handleChapterRead : undefined}
      onSavePosition={isAuthenticated ? handleSavePosition : undefined}
      readChapterIds={isAuthenticated ? readChapterIds : undefined}
    />
  );
}
