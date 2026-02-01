import { useEffect, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { api } from '../api/client';
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
    publication: { id: string; title: string | null };
    chapters: Array<{ id: string; number: number; title: string; hasTranslation: boolean }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            publication: { id: result.id, title: result.title },
            chapters: result.chapters || [],
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
        <button
          type="button"
          class="publication-reading-back"
          onClick={() => route('/catalog')}
        >
          {t('common.back')}
        </button>
      </div>
    );
  }

  const publicationChapters = data.chapters
    .filter((ch) => ch.hasTranslation)
    .map((ch) => ({ id: ch.id, number: ch.number, title: ch.title }));

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
      initialChapterId={chapterId}
      onExit={() => route(`/p/${publicationId}`)}
    />
  );
}
