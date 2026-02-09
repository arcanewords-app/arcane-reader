import { useEffect, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { api } from '../api/client';
import type { PublicationWithChapters, GlossaryEntry } from '../types';
import { BookPlaceholder } from '../components/Dashboard/BookPlaceholder';
import { LoadingSpinner } from '../components/ui';
import { PublicationGlossaryModal } from '../components/Glossary';
import './PublicationPage.css';

interface PublicationPageProps {
  publicationId?: string;
}

export function PublicationPage({ publicationId }: PublicationPageProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<PublicationWithChapters | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGlossary, setShowGlossary] = useState(false);
  const [preloadedGlossary, setPreloadedGlossary] = useState<GlossaryEntry[] | null>(null);

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

  // Preload glossary in background when publication has glossary entries
  useEffect(() => {
    if (!data || (data.glossaryCount ?? 0) <= 0) return;
    let cancelled = false;
    api
      .getPublicationGlossary(data.id)
      .then((list) => {
        if (!cancelled) setPreloadedGlossary(list);
      })
      .catch(() => {
        if (!cancelled) setPreloadedGlossary([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when id or glossaryCount changes
  }, [data?.id, data?.glossaryCount]);

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
  const authorDisplay = pub.authorDisplay || null;
  const translatorDisplay = pub.translatorDisplay || null;
  const langLabel = `${pub.sourceLanguage} → ${pub.targetLanguage}`;
  const chapters = pub.chapters || [];
  const glossaryCount = pub.glossaryCount ?? 0;
  const translatedChapters = chapters
    .filter((ch) => ch.hasTranslation)
    .map((ch) => ({ id: ch.id, number: ch.number, title: ch.title }));

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
          {pub.description && <p class="publication-page-description">{pub.description}</p>}
          {authorDisplay || translatorDisplay ? (
            <div class="publication-page-authors">
              {authorDisplay && (
                <p class="publication-page-author">
                  {t('publication.authorLabel')}: {authorDisplay}
                </p>
              )}
              {translatorDisplay && (
                <p class="publication-page-translator">
                  {t('publication.translatorLabel')}: {translatorDisplay}
                </p>
              )}
            </div>
          ) : (
            <p class="publication-page-author">{t('publication.unknownAuthor')}</p>
          )}
          <p class="publication-page-lang">{langLabel}</p>
          {glossaryCount > 0 && (
            <button
              type="button"
              class="publication-page-glossary-btn"
              onClick={() => setShowGlossary(true)}
              title={t('sidebar.glossary')}
            >
              {t('sidebar.glossary')}
            </button>
          )}
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
      <PublicationGlossaryModal
        isOpen={showGlossary}
        onClose={() => setShowGlossary(false)}
        publicationId={pub.id}
        chapters={translatedChapters}
        preloadedEntries={preloadedGlossary ?? undefined}
      />
    </div>
  );
}
