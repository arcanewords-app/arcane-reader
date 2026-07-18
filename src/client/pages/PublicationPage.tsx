import { useCallback, useEffect, useState, useMemo, useRef } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { api, ApiError } from '../api/client';
import { AUTH_CHANGED_EVENT, authService, openAuthModal } from '../services/authService';
import { trackEvent } from '../utils/analytics';
import type { PublicationWithChapters, GlossaryEntry, PublicEntity } from '../types';
import { usePageMeta } from '../hooks/usePageMeta';
import { useUserRole } from '../hooks/useUserRole';
import { BookPlaceholder } from '../components/Dashboard/BookPlaceholder';
import { PublicationStatusBadge } from '../components/Home/PublicationStatusBadge';
import { PublicationRatingCoverBadge } from '../components/Home/PublicationRatingCoverBadge';
import { EntityCard, TagChip } from '../components/EntityCard';
import { LoadingSpinner, Modal, Button, Icon } from '../components/ui';
import { PublicationGlossaryModal } from '../components/Glossary';
import { ChapterTocModal } from '../components/ChapterTocModal';
import {
  PublicationRatingSummary,
  type PublicationRatingEligibility,
} from '../components/Publication/PublicationRatingSummary';
import { RatePublicationModal } from '../components/Publication/RatePublicationModal';
import {
  buildPublicationPageUrl,
  getPublicationPathFromPathname,
  isPublicationCatalogPath,
  parsePublicationChapterQueryFromUrl,
  sanitizePublicationChapterQueryForAuth,
  type PublicationChapterListQuery,
  type PublicationChapterOrder,
  type PublicationReadFilter,
  type PublicationTranslationFilter,
} from '../utils/publicationRoutes';
import { buildCatalogEntityFilterUrl } from '../utils/catalogRoutes';
import { useUrlSyncListeners } from '../hooks/useUrlSync';
import { subscribeToUserCacheInvalidation } from '../api/cache/invalidation';
import { isChapterReadByWatermark, resolveContinueChapter } from '../../shared/reading-progress';
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
  const [showRateModal, setShowRateModal] = useState(false);
  const [ratingUserScore, setRatingUserScore] = useState<number | null>(null);
  const [ratingEligibility, setRatingEligibility] = useState<PublicationRatingEligibility>('guest');
  const [preloadedGlossary, setPreloadedGlossary] = useState<GlossaryEntry[] | null>(null);
  const [lastReadChapterNumber, setLastReadChapterNumber] = useState(0);
  const [showResetProgressConfirm, setShowResetProgressConfirm] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const initialChapterListQuery = parsePublicationChapterQueryFromUrl();
  const [chapterSearch, setChapterSearch] = useState(initialChapterListQuery.q);
  const [translationFilter, setTranslationFilter] = useState<PublicationTranslationFilter>(
    initialChapterListQuery.translation
  );
  const [chapterFilter, setChapterFilter] = useState<PublicationReadFilter>(
    initialChapterListQuery.read
  );
  const [chapterOrder, setChapterOrder] = useState<PublicationChapterOrder>(
    initialChapterListQuery.order
  );
  const [downloading, setDownloading] = useState<'epub' | 'fb2' | null>(null);
  const [buildingExports, setBuildingExports] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const { user, isAtLeast } = useUserRole();
  const [authorEntity, setAuthorEntity] = useState<PublicEntity | null>(null);
  const [translatorEntity, setTranslatorEntity] = useState<PublicEntity | null>(null);
  const [tagEntities, setTagEntities] = useState<PublicEntity[]>([]);

  // Virtualization for chapter list (same pattern as ChapterList)
  const chapterListRef = useRef<HTMLDivElement | null>(null);
  const [chapterListScrollTop, setChapterListScrollTop] = useState(0);
  const [chapterListHeight, setChapterListHeight] = useState(400);
  const chapterListRafRef = useRef<number | null>(null);
  const PUB_ITEM_HEIGHT = 50;
  const PUB_VIRTUAL_BUFFER = 6;
  const PUB_VIRTUAL_THRESHOLD = 50;

  const chapterListQueryRef = useRef<PublicationChapterListQuery>(initialChapterListQuery);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getPublicationPath = useCallback(() => {
    if (typeof window === 'undefined') return publicationId ?? '';
    return (
      getPublicationPathFromPathname(window.location.pathname) ?? data?.slug ?? publicationId ?? ''
    );
  }, [data?.slug, publicationId]);

  const replaceChapterListUrl = useCallback(
    (query: PublicationChapterListQuery) => {
      const pubPath = getPublicationPath();
      if (!pubPath) return;
      const sanitized = sanitizePublicationChapterQueryForAuth(query, isAuthenticated);
      const url = buildPublicationPageUrl(pubPath, sanitized);
      const current = window.location.pathname + window.location.search;
      if (current !== url) {
        route(url, true);
      }
    },
    [getPublicationPath, isAuthenticated]
  );

  const applyChapterListQuery = useCallback(
    (query: PublicationChapterListQuery, options?: { syncUrl?: boolean }) => {
      const sanitized = sanitizePublicationChapterQueryForAuth(query, isAuthenticated);
      chapterListQueryRef.current = sanitized;
      setChapterSearch(sanitized.q);
      setTranslationFilter(sanitized.translation);
      setChapterFilter(sanitized.read);
      setChapterOrder(sanitized.order);

      if (options?.syncUrl === false) return;
      replaceChapterListUrl(sanitized);
    },
    [isAuthenticated, replaceChapterListUrl]
  );

  const handleChapterSearchChange = useCallback(
    (value: string) => {
      setChapterSearch(value);
      const next = { ...chapterListQueryRef.current, q: value };
      chapterListQueryRef.current = next;
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(() => {
        const sanitized = sanitizePublicationChapterQueryForAuth(next, isAuthenticated);
        replaceChapterListUrl(sanitized);
      }, 300);
    },
    [isAuthenticated, replaceChapterListUrl]
  );

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  const syncChapterListFromUrl = useCallback(() => {
    const parsed = sanitizePublicationChapterQueryForAuth(
      parsePublicationChapterQueryFromUrl(),
      isAuthenticated
    );
    applyChapterListQuery(parsed, { syncUrl: false });
  }, [isAuthenticated, applyChapterListQuery]);

  useUrlSyncListeners(syncChapterListFromUrl, () =>
    isPublicationCatalogPath(window.location.pathname)
  );

  useEffect(() => {
    if (isAuthenticated) return;
    if (chapterListQueryRef.current.read === 'all') return;
    applyChapterListQuery({ ...chapterListQueryRef.current, read: 'all' });
  }, [isAuthenticated, applyChapterListQuery]);

  const syncAuthProgress = useCallback(async () => {
    const user = await authService.getCurrentUser();
    setIsAuthenticated(!!user);
    if (!user || !publicationId) {
      setLastReadChapterNumber(0);
      return;
    }
    try {
      const { lastReadChapterNumber: watermark } = await api.getReadProgress(publicationId);
      setLastReadChapterNumber(watermark ?? 0);
    } catch {
      // Ignore read progress errors on public page.
    }
    try {
      const status = await api.getPublicationRatingStatus(publicationId);
      setRatingUserScore(status.userScore);
      setRatingEligibility(status.eligibility);
    } catch {
      setRatingUserScore(null);
      setRatingEligibility(user ? 'not_read' : 'guest');
    }
  }, [publicationId]);

  const handleSetProgressToChapter = useCallback(
    (chapterNumber: number) => {
      if (!publicationId || !isAuthenticated) return;
      setLastReadChapterNumber(chapterNumber);
      api.updateReadProgress(publicationId, chapterNumber, 'set').catch(() => {
        syncAuthProgress().catch(() => {});
      });
    },
    [publicationId, isAuthenticated, syncAuthProgress]
  );

  const handleResetProgress = useCallback(async () => {
    if (!publicationId || !isAuthenticated) return;
    try {
      await api.resetReadProgress(publicationId);
      setLastReadChapterNumber(0);
      setShowResetProgressConfirm(false);
    } catch {
      syncAuthProgress().catch(() => {});
    }
  }, [publicationId, isAuthenticated, syncAuthProgress]);

  useEffect(() => {
    if (!publicationId) return;
    let cancelled = false;
    api
      .getPublicationWithChapters(publicationId)
      .then((result) => {
        if (!cancelled) setData(result);
        // Load entities in parallel with same tick — no waterfall
        const authorId = result.authorEntityId;
        const translatorId = result.translatorEntityId;
        const tagIds = result.tagEntityIds ?? [];
        if (authorId || translatorId || tagIds.length > 0) {
          Promise.all([
            authorId ? api.getPublicEntityById(authorId) : Promise.resolve(null),
            translatorId ? api.getPublicEntityById(translatorId) : Promise.resolve(null),
            ...tagIds.map((id) => api.getPublicEntityById(id)),
          ]).then((results) => {
            if (cancelled) return;
            const [author, translator, ...tags] = results;
            setAuthorEntity(author ?? null);
            setTranslatorEntity(translator ?? null);
            setTagEntities(tags.filter((e): e is PublicEntity => e != null));
          });
        } else if (!cancelled) {
          setAuthorEntity(null);
          setTranslatorEntity(null);
          setTagEntities([]);
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
    if (data?.id) {
      trackEvent('view_item', { item_id: data.id });
    }
  }, [data?.id]);

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

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        syncAuthProgress().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    const unsubCache = subscribeToUserCacheInvalidation(() => {
      syncAuthProgress().catch(() => {});
    });
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      unsubCache();
    };
  }, [syncAuthProgress]);

  const pub = data;
  const meta =
    pub && publicationId
      ? {
          title: pub.title || t('publication.untitled'),
          description: (() => {
            const baseDesc =
              pub.description ||
              (pub.authorDisplay ? `${pub.title || ''} by ${pub.authorDisplay}` : pub.title || '');
            const hasBuiltExports = !!(pub.epubStoragePath || pub.fb2StoragePath);
            return hasBuiltExports
              ? `${baseDesc} Читать онлайн или скачать EPUB, FB2.`
              : `${baseDesc} Читать онлайн.`;
          })(),
          imageUrl: pub.coverImageUrl,
          authorDisplay: pub.authorDisplay,
          translatorDisplay: pub.translatorDisplay,
          targetLanguage: pub.targetLanguage,
          numberOfPages: (pub.chapters || []).length,
          breadcrumbs:
            typeof window !== 'undefined'
              ? [
                  { name: t('nav.catalog'), url: `${window.location.origin}/catalog` },
                  {
                    name: pub.title || t('publication.untitled'),
                    url: `${window.location.origin}/p/${publicationId}`,
                  },
                ]
              : undefined,
        }
      : null;
  usePageMeta(meta);

  const chapters = useMemo(() => pub?.chapters ?? [], [pub?.chapters]);
  const hasTranslatedChapters = chapters.some((ch) => ch.hasTranslation);
  const hasUntranslatedChapters = chapters.some((ch) => !ch.hasTranslation);
  const showTranslationFilter = hasTranslatedChapters && hasUntranslatedChapters;

  const filteredChapters = useMemo(() => {
    const filtered = chapters.filter((ch) => {
      const matchesSearch =
        !chapterSearch ||
        (ch.title || '').toLowerCase().includes(chapterSearch.toLowerCase()) ||
        String(ch.number).includes(chapterSearch);
      if (!matchesSearch) return false;
      // Translation filter (only when both types exist; otherwise show all)
      if (showTranslationFilter) {
        if (translationFilter === 'translated' && !ch.hasTranslation) return false;
        if (translationFilter === 'untranslated' && ch.hasTranslation) return false;
      }
      // Read status filter (auth only)
      if (!isAuthenticated || chapterFilter === 'all') return true;
      const isRead = isChapterReadByWatermark(ch.number, lastReadChapterNumber);
      if (chapterFilter === 'read') return isRead;
      if (chapterFilter === 'unread') return !isRead;
      return true;
    });
    return [...filtered].sort((a, b) =>
      chapterOrder === 'desc' ? b.number - a.number : a.number - b.number
    );
  }, [
    chapters,
    chapterSearch,
    showTranslationFilter,
    translationFilter,
    chapterFilter,
    chapterOrder,
    isAuthenticated,
    lastReadChapterNumber,
  ]);

  const handleChapterListScroll = useCallback(() => {
    const el = chapterListRef.current;
    if (!el) return;
    if (chapterListRafRef.current !== null) return;
    chapterListRafRef.current = requestAnimationFrame(() => {
      chapterListRafRef.current = null;
      setChapterListScrollTop(el.scrollTop);
    });
  }, []);

  // ResizeObserver for chapter list — runs when data loads (ref is set)
  useEffect(() => {
    const el = chapterListRef.current;
    if (!el || !data) return;
    const onResize = () => setChapterListHeight(el.clientHeight || 400);
    onResize();
    const obs = new ResizeObserver(onResize);
    obs.observe(el);
    return () => obs.disconnect();
  }, [data]);

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

  const pubPath = pub.slug || pub.id;
  const title = pub.title || t('publication.untitled');
  const authorDisplay = pub.authorDisplay || null;
  const translatorDisplay = pub.translatorDisplay || null;
  const langLabel = pub.targetLanguage
    ? t('publication.languageLabel', {
        language: t(`language.${pub.targetLanguage}`) || pub.targetLanguage.toUpperCase(),
      })
    : null;
  const translatedChapters = chapters
    .filter((ch) => ch.hasTranslation)
    .map((ch) => ({ id: ch.id, number: ch.number, title: ch.title }));
  const hasBuiltExports = !!(pub.epubStoragePath || pub.fb2StoragePath);
  const canBuildExports = translatedChapters.length > 0;
  const isOwner = !!user && pub.userId === user.id;
  const isAuthor = !!user && isAtLeast('author');
  const glossaryCount = pub.glossaryCount ?? 0;

  const continueChapterRef = resolveContinueChapter(
    chapters
      .filter((ch) => ch.hasTranslation)
      .map((ch) => ({
        id: ch.id,
        number: ch.number,
        hasTranslation: true,
      })),
    lastReadChapterNumber
  );
  const continueChapter = continueChapterRef
    ? chapters.find((ch) => ch.id === continueChapterRef.id)
    : null;
  const showContinueReading = isAuthenticated && !!continueChapter;
  const continueChapterLabel = continueChapter
    ? continueChapter.title?.trim()
      ? continueChapter.title
      : t('chapterList.defaultChapterTitle', { number: continueChapter.number })
    : '';

  const handleDownload = async (format: 'epub' | 'fb2') => {
    if (!pub) return;
    if (!isAuthenticated) {
      setShowLoginPrompt(true);
      return;
    }
    setDownloading(format);
    try {
      await api.downloadPublicationExport(pub.id, format);
      trackEvent('export', { format });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      console.error('Download failed:', err);
      setExportError(
        err instanceof Error
          ? err.message
          : t('projectInfo.exportError', { format: format.toUpperCase() })
      );
    } finally {
      setDownloading(null);
    }
  };

  const handleBuildExports = async () => {
    if (!pub || !canBuildExports) return;
    setBuildingExports(true);
    try {
      const result = await api.buildPublicationExports(pub.id);
      if (result.epubReady || result.fb2Ready) {
        const refreshed = await api.getPublicationWithChapters(publicationId!);
        setData(refreshed);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      console.error('Build exports failed:', err);
      setExportError(err instanceof Error ? err.message : t('publication.buildExportsError'));
    } finally {
      setBuildingExports(false);
    }
  };

  return (
    <div class="publication-page">
      <div class="publication-page-header">
        <button type="button" class="publication-page-back" onClick={() => route('/catalog')}>
          <Icon name="arrow_back" size="sm" /> {t('common.back')}
        </button>
      </div>
      <div class="publication-page-content">
        <div class="publication-page-cover">
          {pub.translationStatus && <PublicationStatusBadge status={pub.translationStatus} />}
          <PublicationRatingCoverBadge ratingAvg={pub.ratingAvg} ratingCount={pub.ratingCount} />
          {pub.coverImageUrl ? (
            <img src={pub.coverImageUrl} alt={title} />
          ) : (
            <BookPlaceholder projectName={title} projectType="book" />
          )}
        </div>
        <div class="publication-page-meta">
          <h1 class="publication-page-title">{title}</h1>
          {pub.description && <p class="publication-page-description">{pub.description}</p>}
          {authorEntity || translatorEntity || authorDisplay || translatorDisplay ? (
            <div class="publication-page-authors">
              {authorEntity ? (
                <div class="publication-page-entity">
                  <span class="publication-page-entity-label">{t('publication.authorLabel')}</span>
                  <EntityCard
                    entity={authorEntity}
                    compact
                    onClick={() => {
                      route(buildCatalogEntityFilterUrl('author', authorEntity.id));
                    }}
                  />
                </div>
              ) : (
                authorDisplay && (
                  <p class="publication-page-author">
                    {t('publication.authorLabel')}: {authorDisplay}
                  </p>
                )
              )}
              {translatorEntity ? (
                <div class="publication-page-entity">
                  <span class="publication-page-entity-label">
                    {t('publication.translatorLabel')}
                  </span>
                  <EntityCard
                    entity={translatorEntity}
                    compact
                    onClick={() => {
                      route(buildCatalogEntityFilterUrl('translator', translatorEntity.id));
                    }}
                  />
                </div>
              ) : (
                translatorDisplay && (
                  <p class="publication-page-translator">
                    {t('publication.translatorLabel')}: {translatorDisplay}
                  </p>
                )
              )}
            </div>
          ) : (
            <p class="publication-page-author">{t('publication.unknownAuthor')}</p>
          )}
          {tagEntities.length > 0 && (
            <div class="publication-page-tags">
              {tagEntities.map((entity) => (
                <TagChip
                  key={entity.id}
                  entity={entity}
                  onClick={() => {
                    route(buildCatalogEntityFilterUrl('tag', entity.id));
                  }}
                />
              ))}
            </div>
          )}
          {langLabel && <p class="publication-page-lang">{langLabel}</p>}
          <PublicationRatingSummary
            ratingAvg={pub.ratingAvg}
            ratingCount={pub.ratingCount}
            userScore={ratingUserScore}
            eligibility={ratingEligibility}
            onRateClick={() => setShowRateModal(true)}
            onLoginClick={() => openAuthModal()}
          />
          <div class="publication-page-actions">
            {pub.sourceUrl && (
              <a
                href={pub.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="publication-page-source-link"
              >
                <Icon name="open_in_new" size="sm" />
                {t('publication.originalLink')}
              </a>
            )}
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
            {hasBuiltExports ? (
              isAuthenticated ? (
                <>
                  {pub.epubStoragePath && (
                    <button
                      type="button"
                      class="publication-page-toc-btn"
                      onClick={() => handleDownload('epub')}
                      disabled={downloading !== null}
                      title={t('export.epub')}
                    >
                      {downloading === 'epub' ? '...' : <Icon name="menu_book" size="sm" />}{' '}
                      {t('export.epub')}
                    </button>
                  )}
                  {pub.fb2StoragePath && (
                    <button
                      type="button"
                      class="publication-page-toc-btn"
                      onClick={() => handleDownload('fb2')}
                      disabled={downloading !== null}
                      title={t('export.fb2')}
                    >
                      {downloading === 'fb2' ? '...' : <Icon name="book_2" size="sm" />}{' '}
                      {t('export.fb2')}
                    </button>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  class="publication-page-toc-btn"
                  onClick={() => setShowLoginPrompt(true)}
                  title={t('publication.downloadLoginRequired')}
                >
                  {t('publication.downloadLoginRequired')}
                </button>
              )
            ) : isOwner && isAuthor && canBuildExports ? (
              <button
                type="button"
                class="publication-page-toc-btn"
                onClick={handleBuildExports}
                disabled={buildingExports}
                title={t('publication.prepareExports')}
              >
                {buildingExports ? '...' : <Icon name="download" size="sm" />}{' '}
                {t('publication.prepareExports')}
              </button>
            ) : (
              canBuildExports && (
                <>
                  <button
                    type="button"
                    class="publication-page-toc-btn"
                    disabled
                    title={t('publication.exportsNotReadyTooltip')}
                  >
                    <Icon name="menu_book" size="sm" /> {t('export.epub')}
                  </button>
                  <button
                    type="button"
                    class="publication-page-toc-btn"
                    disabled
                    title={t('publication.exportsNotReadyTooltip')}
                  >
                    <Icon name="book_2" size="sm" /> {t('export.fb2')}
                  </button>
                </>
              )
            )}
          </div>
          {chapters.length > 0 && (
            <div class="publication-page-chapters">
              <h2>{t('publication.chapters')}</h2>
              <div class="publication-page-chapters-toolbar">
                <div class="publication-page-chapters-search-row">
                  <input
                    type="text"
                    class="publication-page-chapter-search"
                    placeholder={t('toc.searchPlaceholder')}
                    value={chapterSearch}
                    onInput={(e: Event) =>
                      handleChapterSearchChange((e.target as HTMLInputElement).value)
                    }
                  />
                  {showContinueReading && continueChapter && (
                    <button
                      type="button"
                      class="publication-page-continue-from"
                      onClick={() => route(`/p/${pubPath}/chapters/${continueChapter.id}/reading`)}
                    >
                      <Icon name="menu_book" size="sm" />
                      <span class="publication-page-continue-from-label">
                        {t('publication.continueNextChapter', {
                          chapter: continueChapterLabel,
                        })}
                      </span>
                    </button>
                  )}
                </div>
                <div class="publication-page-chapter-filters">
                  <button
                    type="button"
                    class={chapterOrder === 'asc' ? 'active' : ''}
                    onClick={() =>
                      applyChapterListQuery({ ...chapterListQueryRef.current, order: 'asc' })
                    }
                  >
                    <Icon name="arrow_upward" size="sm" /> {t('publication.orderFromStart')}
                  </button>
                  <button
                    type="button"
                    class={chapterOrder === 'desc' ? 'active' : ''}
                    onClick={() =>
                      applyChapterListQuery({ ...chapterListQueryRef.current, order: 'desc' })
                    }
                  >
                    <Icon name="arrow_downward" size="sm" /> {t('publication.orderFromEnd')}
                  </button>
                </div>
                {showTranslationFilter && (
                  <div class="publication-page-chapter-filters">
                    <button
                      type="button"
                      class={translationFilter === 'translated' ? 'active' : ''}
                      onClick={() =>
                        applyChapterListQuery({
                          ...chapterListQueryRef.current,
                          translation: 'translated',
                        })
                      }
                    >
                      <Icon name="translate" size="sm" /> {t('publication.filterTranslated')}
                    </button>
                    <button
                      type="button"
                      class={translationFilter === 'all' ? 'active' : ''}
                      onClick={() =>
                        applyChapterListQuery({
                          ...chapterListQueryRef.current,
                          translation: 'all',
                        })
                      }
                    >
                      <Icon name="grid_view" size="sm" /> {t('publication.filterAll')}
                    </button>
                    <button
                      type="button"
                      class={translationFilter === 'untranslated' ? 'active' : ''}
                      onClick={() =>
                        applyChapterListQuery({
                          ...chapterListQueryRef.current,
                          translation: 'untranslated',
                        })
                      }
                    >
                      <Icon name="block" size="sm" /> {t('publication.filterUntranslated')}
                    </button>
                  </div>
                )}
                {isAuthenticated && (
                  <div class="publication-page-chapter-filters">
                    <button
                      type="button"
                      class={chapterFilter === 'all' ? 'active' : ''}
                      onClick={() =>
                        applyChapterListQuery({ ...chapterListQueryRef.current, read: 'all' })
                      }
                    >
                      <Icon name="grid_view" size="sm" /> {t('publication.filterAll')}
                    </button>
                    <button
                      type="button"
                      class={chapterFilter === 'unread' ? 'active' : ''}
                      onClick={() =>
                        applyChapterListQuery({ ...chapterListQueryRef.current, read: 'unread' })
                      }
                    >
                      <Icon name="mark_email_unread" size="sm" /> {t('publication.filterUnread')}
                    </button>
                    <button
                      type="button"
                      class={chapterFilter === 'read' ? 'active' : ''}
                      onClick={() =>
                        applyChapterListQuery({ ...chapterListQueryRef.current, read: 'read' })
                      }
                    >
                      <Icon name="check_circle" size="sm" /> {t('publication.filterRead')}
                    </button>
                    {lastReadChapterNumber > 0 && (
                      <button
                        type="button"
                        class="publication-page-reset-progress"
                        onClick={() => setShowResetProgressConfirm(true)}
                      >
                        <Icon name="restart_alt" size="sm" /> {t('readingProgress.reset')}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div
                class="publication-page-chapters-list"
                ref={chapterListRef}
                onScroll={handleChapterListScroll}
              >
                {(() => {
                  const total = filteredChapters.length;
                  const useVirtualization = total > PUB_VIRTUAL_THRESHOLD;
                  const totalHeight = useVirtualization ? total * PUB_ITEM_HEIGHT : 0;
                  const start = useVirtualization
                    ? Math.max(
                        0,
                        Math.floor(chapterListScrollTop / PUB_ITEM_HEIGHT) - PUB_VIRTUAL_BUFFER
                      )
                    : 0;
                  const end = useVirtualization
                    ? Math.min(
                        total,
                        Math.ceil((chapterListScrollTop + chapterListHeight) / PUB_ITEM_HEIGHT) +
                          PUB_VIRTUAL_BUFFER
                      )
                    : total;
                  const visibleChapters = useVirtualization
                    ? filteredChapters.slice(start, end)
                    : filteredChapters;
                  const paddingTop = useVirtualization ? start * PUB_ITEM_HEIGHT : 0;
                  const paddingBottom = useVirtualization
                    ? Math.max(0, totalHeight - end * PUB_ITEM_HEIGHT)
                    : 0;

                  if (useVirtualization) {
                    return (
                      <div style={{ height: totalHeight + 'px', position: 'relative' }}>
                        <div
                          style={{
                            paddingTop: paddingTop + 'px',
                            paddingBottom: paddingBottom + 'px',
                          }}
                        >
                          <ul>
                            {visibleChapters.map((ch) => {
                              const isRead = isChapterReadByWatermark(
                                ch.number,
                                lastReadChapterNumber
                              );
                              return (
                                <li
                                  key={ch.id}
                                  style={{
                                    minHeight: PUB_ITEM_HEIGHT + 'px',
                                    boxSizing: 'border-box',
                                  }}
                                >
                                  <span class="publication-page-chapter-title">
                                    {ch.title ||
                                      t('chapterList.defaultChapterTitle', {
                                        number: ch.number,
                                      })}
                                    {isAuthenticated && isRead && (
                                      <span
                                        class="publication-page-chapter-read"
                                        title={t('publication.read')}
                                      >
                                        <Icon name="check" size="sm" />
                                      </span>
                                    )}
                                  </span>
                                  {isAuthenticated && !isRead && ch.hasTranslation && (
                                    <button
                                      type="button"
                                      class="publication-page-chapter-mark-read"
                                      title={t('publication.markUpToHere')}
                                      aria-label={t('publication.markUpToHere')}
                                      onClick={() => handleSetProgressToChapter(ch.number)}
                                    >
                                      <Icon name="check_circle" size="sm" />
                                    </button>
                                  )}
                                  {ch.hasTranslation ? (
                                    <button
                                      type="button"
                                      class="publication-page-read-chapter"
                                      onClick={() =>
                                        route(`/p/${pubPath}/chapters/${ch.id}/reading`)
                                      }
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
                      </div>
                    );
                  }
                  return (
                    <ul>
                      {visibleChapters.map((ch) => {
                        const isRead = isChapterReadByWatermark(ch.number, lastReadChapterNumber);
                        return (
                          <li key={ch.id}>
                            <span class="publication-page-chapter-title">
                              {ch.title ||
                                t('chapterList.defaultChapterTitle', { number: ch.number })}
                              {isAuthenticated && isRead && (
                                <span
                                  class="publication-page-chapter-read"
                                  title={t('publication.read')}
                                >
                                  <Icon name="check" size="sm" />
                                </span>
                              )}
                            </span>
                            {isAuthenticated && !isRead && ch.hasTranslation && (
                              <button
                                type="button"
                                class="publication-page-chapter-mark-read"
                                title={t('publication.markUpToHere')}
                                aria-label={t('publication.markUpToHere')}
                                onClick={() => handleSetProgressToChapter(ch.number)}
                              >
                                <Icon name="check_circle" size="sm" />
                              </button>
                            )}
                            {ch.hasTranslation ? (
                              <button
                                type="button"
                                class="publication-page-read-chapter"
                                onClick={() => route(`/p/${pubPath}/chapters/${ch.id}/reading`)}
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
                  );
                })()}
              </div>
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
        lastReadChapterNumber={isAuthenticated ? lastReadChapterNumber : 0}
        onSetProgressToChapter={isAuthenticated ? handleSetProgressToChapter : undefined}
        onSelectChapter={(chapterId) => {
          setShowToc(false);
          route(`/p/${pubPath}/chapters/${chapterId}/reading`);
        }}
      />
      {publicationId && (
        <RatePublicationModal
          isOpen={showRateModal}
          onClose={() => setShowRateModal(false)}
          initialScore={ratingUserScore}
          onSave={async (score) => {
            const result = await api.upsertPublicationRating(publicationId, score);
            setRatingUserScore(result.score);
            setRatingEligibility('eligible');
            const refreshed = await api.getPublicationWithChapters(publicationId);
            setData(refreshed);
          }}
          onRemove={
            ratingUserScore != null
              ? async () => {
                  await api.deletePublicationRating(publicationId);
                  setRatingUserScore(null);
                  const refreshed = await api.getPublicationWithChapters(publicationId);
                  setData(refreshed);
                }
              : undefined
          }
        />
      )}
      <Modal
        isOpen={showResetProgressConfirm}
        onClose={() => setShowResetProgressConfirm(false)}
        title={t('readingProgress.resetConfirmTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowResetProgressConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void handleResetProgress()}>
              {t('readingProgress.resetConfirmYes')}
            </Button>
          </>
        }
      >
        <p>{t('readingProgress.resetConfirmBody')}</p>
      </Modal>
      <Modal
        isOpen={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        title={t('publication.downloadLoginRequired')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowLoginPrompt(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                setShowLoginPrompt(false);
                window.dispatchEvent(
                  new CustomEvent('arcane:auth-error', { detail: { message: '' } })
                );
              }}
            >
              {t('auth.login')}
            </Button>
          </>
        }
      >
        <p class="publication-page-modal-text">{t('publication.downloadLoginRequired')}</p>
      </Modal>
      <Modal
        isOpen={!!exportError}
        onClose={() => setExportError(null)}
        title={t('projectInfo.exportError', { format: 'EPUB/FB2' })}
        footer={<Button onClick={() => setExportError(null)}>{t('common.close')}</Button>}
      >
        <p class="publication-page-modal-text">{exportError}</p>
      </Modal>
    </div>
  );
}
