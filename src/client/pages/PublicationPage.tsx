import { useEffect, useState, useMemo } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { api } from '../api/client';
import { authService } from '../services/authService';
import type { PublicationWithChapters, GlossaryEntry } from '../types';
import { usePageMeta } from '../hooks/usePageMeta';
import { BookPlaceholder } from '../components/Dashboard/BookPlaceholder';
import { LoadingSpinner } from '../components/ui';
import { PublicationGlossaryModal } from '../components/Glossary';
import { ChapterTocModal } from '../components/ChapterTocModal';
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
  const [showToc, setShowToc] = useState(false);
  const [preloadedGlossary, setPreloadedGlossary] = useState<GlossaryEntry[] | null>(null);
  const [readChapterIds, setReadChapterIds] = useState<Set<string>>(new Set());
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [chapterSearch, setChapterSearch] = useState('');
  const [chapterFilter, setChapterFilter] = useState<'all' | 'unread' | 'read'>('all');

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

  // Load read progress for authenticated users
  useEffect(() => {
    let cancelled = false;
    authService.getCurrentUser().then((user) => {
      if (cancelled) return;
      setIsAuthenticated(!!user);
      if (user && publicationId) {
        api
          .getReadProgress(publicationId)
          .then(({ chapterIds }) => {
            if (!cancelled) setReadChapterIds(new Set(chapterIds));
          })
          .catch(() => {});
      }
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
  const description =
    pub.description || (pub.authorDisplay ? `${title} by ${pub.authorDisplay}` : title);
  usePageMeta({
    title,
    description,
    imageUrl: pub.coverImageUrl,
  });
  const authorDisplay = pub.authorDisplay || null;
  const translatorDisplay = pub.translatorDisplay || null;
  const langLabel = `${pub.sourceLanguage} → ${pub.targetLanguage}`;
  const chapters = pub.chapters || [];
  const glossaryCount = pub.glossaryCount ?? 0;
  const translatedChapters = chapters
    .filter((ch) => ch.hasTranslation)
    .map((ch) => ({ id: ch.id, number: ch.number, title: ch.title }));

  const filteredChapters = useMemo(() => {
    return chapters.filter((ch) => {
      const matchesSearch =
        !chapterSearch ||
        (ch.title || '').toLowerCase().includes(chapterSearch.toLowerCase()) ||
        String(ch.number).includes(chapterSearch);
      if (!matchesSearch) return false;
      if (!isAuthenticated || chapterFilter === 'all') return true;
      const isRead = readChapterIds.has(ch.id);
      if (chapterFilter === 'read') return isRead;
      if (chapterFilter === 'unread') return !isRead;
      return true;
    });
  }, [chapters, chapterSearch, chapterFilter, isAuthenticated, readChapterIds]);

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
          <div class="publication-page-actions">
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
            {translatedChapters.length > 0 && (
              <button
                type="button"
                class="publication-page-toc-btn"
                onClick={() => setShowToc(true)}
                title={t('readingMode.toc')}
              >
                {t('readingMode.toc')}
              </button>
            )}
          </div>
          {chapters.length > 0 && (
            <div class="publication-page-chapters">
              <h2>{t('publication.chapters')}</h2>
              <div class="publication-page-chapters-toolbar">
                <input
                  type="text"
                  class="publication-page-chapter-search"
                  placeholder={t('toc.searchPlaceholder')}
                  value={chapterSearch}
                  onInput={(e: Event) => setChapterSearch((e.target as HTMLInputElement).value)}
                />
                {isAuthenticated && (
                  <div class="publication-page-chapter-filters">
                    <button
                      type="button"
                      class={chapterFilter === 'all' ? 'active' : ''}
                      onClick={() => setChapterFilter('all')}
                    >
                      {t('publication.filterAll')}
                    </button>
                    <button
                      type="button"
                      class={chapterFilter === 'unread' ? 'active' : ''}
                      onClick={() => setChapterFilter('unread')}
                    >
                      {t('publication.filterUnread')}
                    </button>
                    <button
                      type="button"
                      class={chapterFilter === 'read' ? 'active' : ''}
                      onClick={() => setChapterFilter('read')}
                    >
                      {t('publication.filterRead')}
                    </button>
                  </div>
                )}
              </div>
              <ul>
                {filteredChapters.map((ch) => {
                  const isRead = readChapterIds.has(ch.id);
                  return (
                    <li key={ch.id}>
                      <span class="publication-page-chapter-title">
                        {ch.title || t('chapterList.defaultChapterTitle', { number: ch.number })}
                        {isAuthenticated && isRead && (
                          <span class="publication-page-chapter-read" title={t('publication.read')}>
                            ✓
                          </span>
                        )}
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
                  );
                })}
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
      <ChapterTocModal
        isOpen={showToc}
        onClose={() => setShowToc(false)}
        chapters={translatedChapters}
        readChapterIds={isAuthenticated ? readChapterIds : undefined}
        onSelectChapter={(chapterId) => {
          setShowToc(false);
          route(`/p/${pub.id}/chapters/${chapterId}/reading`);
        }}
      />
    </div>
  );
}
