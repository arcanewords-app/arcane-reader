import { useEffect, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { api } from '../api/client';
import type { PublicationWithChapters } from '../types';
import { BookPlaceholder } from '../components/Dashboard/BookPlaceholder';
import { LoadingSpinner } from '../components/ui';
import './PublicationPage.css';

interface PublicationPageProps {
  publicationId?: string;
}

export function PublicationPage({ publicationId }: PublicationPageProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<PublicationWithChapters | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicationId) return;
    let cancelled = false;
    api
      .getPublicationWithChapters(publicationId)
      .then((result) => {
        if (!cancelled) setData(result);
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

  if (!publicationId) {
    route('/catalog');
    return null;
  }

  if (loading) {
    return (
      <div class="publication-page">
        <div class="publication-page-loading">
          <LoadingSpinner size="lg" text={t('common.loading')} />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div class="publication-page">
        <div class="publication-page-error">
          <p>{t('publication.notFound')}</p>
          <button type="button" class="publication-page-back" onClick={() => route('/catalog')}>
            {t('common.back')}
          </button>
        </div>
      </div>
    );
  }

  const pub = data;
  const title = pub.title || t('publication.untitled');
  const authorDisplay = pub.authorDisplay || t('publication.unknownAuthor');
  const langLabel = `${pub.sourceLanguage} → ${pub.targetLanguage}`;
  const chapters = pub.chapters || [];

  return (
    <div class="publication-page">
      <div class="publication-page-header">
        <button type="button" class="publication-page-back" onClick={() => route('/catalog')}>
          ← {t('common.back')}
        </button>
      </div>
      <div class="publication-page-content">
        <div class="publication-page-cover">
          {pub.coverImageUrl ? (
            <img src={pub.coverImageUrl} alt={title} />
          ) : (
            <BookPlaceholder projectName={title} projectType="book" />
          )}
        </div>
        <div class="publication-page-meta">
          <h1 class="publication-page-title">{title}</h1>
          {pub.description && (
            <p class="publication-page-description">{pub.description}</p>
          )}
          <p class="publication-page-author">{authorDisplay}</p>
          <p class="publication-page-lang">{langLabel}</p>
          {chapters.length > 0 && (
            <div class="publication-page-chapters">
              <h2>{t('publication.chapters')}</h2>
              <ul>
                {chapters.map((ch) => (
                  <li key={ch.id}>
                    <span class="publication-page-chapter-title">
                      {ch.title || t('chapterList.defaultChapterTitle', { number: ch.number })}
                    </span>
                    {ch.hasTranslation ? (
                      <button
                        type="button"
                        class="publication-page-read-chapter"
                        onClick={() => route(`/p/${pub.id}/chapters/${ch.id}/reading`)}
                      >
                        {t('home.read')}
                      </button>
                    ) : (
                      <span class="publication-page-chapter-untranslated">
                        {t('publication.notTranslated')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
