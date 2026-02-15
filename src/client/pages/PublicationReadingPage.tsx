import { useEffect, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { api } from '../api/client';
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
    };
    chapters: Array<{ id: string; number: number; title: string; hasTranslation: boolean }>;
    glossaryCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preloadedGlossary, setPreloadedGlossary] = useState<GlossaryEntry[] | null>(null);

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

  if (!publicationId) return null;

  if (loading) {
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

  const publicationChapters = data.chapters
    .filter((ch) => ch.hasTranslation)
    .map((ch) => ({ id: ch.id, number: ch.number, title: ch.title }));

  const bookTitle = data.publication.title || t('publication.untitled');
  const currentChapter = chapterId
    ? data.chapters.find((ch) => ch.id === chapterId)
    : publicationChapters[0];
  const chapterTitle = currentChapter
    ? currentChapter.title ||
      t('chapterList.defaultChapterTitle', { number: currentChapter.number })
    : bookTitle;
  const pageTitle = currentChapter ? `${chapterTitle} — ${bookTitle}` : bookTitle;
  const pageDescription = currentChapter
    ? `${chapterTitle} — ${bookTitle}`
    : data.publication.description || (data.publication.title ? `${bookTitle}` : bookTitle);
  usePageMeta({
    title: pageTitle,
    description: pageDescription,
    imageUrl: data.publication.coverImageUrl,
  });

  if (publicationChapters.length === 0) {
    return (
      <div class="publication-reading-placeholder">
        <p>{t('readingMode.noTranslatedChapters')}</p>
        <button
          type="button"
          class="publication-reading-back"
          onClick={() => route(`/p/${publicationId}`)}
        >
          {t('common.back')}
        </button>
      </div>
    );
  }

  return (
    <ReadingMode
      publicationId={publicationId}
      publicationTitle={data.publication.title || undefined}
      publicationChapters={publicationChapters}
      publicationGlossaryCount={data.glossaryCount}
      publicationGlossaryPreloaded={preloadedGlossary ?? undefined}
      initialChapterId={chapterId}
      onExit={() => route(`/p/${publicationId}`)}
    />
  );
}
