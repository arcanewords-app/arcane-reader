import { useCallback, useEffect, useState, useMemo, useRef } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { api, ApiError } from '../api/client';
import { AUTH_CHANGED_EVENT, authService } from '../services/authService';
import { trackEvent } from '../utils/analytics';
import type { PublicationWithChapters, GlossaryEntry, PublicEntity } from '../types';
import { usePageMeta } from '../hooks/usePageMeta';
import { BookPlaceholder } from '../components/Dashboard/BookPlaceholder';
import { EntityCard, TagChip } from '../components/EntityCard';
import { LoadingSpinner, Modal, Button, Icon } from '../components/ui';
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
  const [translationFilter, setTranslationFilter] = useState<'translated' | 'all' | 'untranslated'>(
    'translated'
  );
  const [chapterFilter, setChapterFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [chapterOrder, setChapterOrder] = useState<'asc' | 'desc'>('asc');
  const [exporting, setExporting] = useState<'epub' | 'fb2' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
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

  const syncAuthProgress = useCallback(async () => {
    const user = await authService.getCurrentUser();
    setIsAuthenticated(!!user);
    if (!user || !publicationId) {
      setReadChapterIds(new Set());
      return;
    }
    try {
      const { chapterIds } = await api.getReadProgress(publicationId);
      setReadChapterIds(new Set(chapterIds));
    } catch {
      // Ignore read progress errors on public page.
    }
  }, [publicationId]);

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

  const pub = data;
  const meta =
    pub && publicationId
      ? {
          title: pub.title || t('publication.untitled'),
          description: (() => {
            const baseDesc =
              pub.description ||
              (pub.authorDisplay ? `${pub.title || ''} by ${pub.authorDisplay}` : pub.title || '');
            const hasExport = (pub.chapters || []).some((ch) => ch.hasTranslation);
            return hasExport
              ? `${baseDesc} Читать онлайн или скачать EPUB, FB2.`
              : `${baseDesc} Читать онлайн.`;
          })(),
          imageUrl: pub.coverImageUrl,
          authorDisplay: pub.authorDisplay,
          translatorDisplay: pub.translatorDisplay,
          targetLanguage: pub.targetLanguage,
        }
      : null;
  usePageMeta(meta);

  const chapters = pub?.chapters || [];
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
      const isRead = readChapterIds.has(ch.id);
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
    readChapterIds,
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
  const hasExport = chapters.some((ch) => ch.hasTranslation);
  const glossaryCount = pub.glossaryCount ?? 0;
  const translatedChapters = chapters
    .filter((ch) => ch.hasTranslation)
    .map((ch) => ({ id: ch.id, number: ch.number, title: ch.title }));

  const handleExport = async (format: 'epub' | 'fb2') => {
    if (!pub || translatedChapters.length === 0) return;
    if (!isAuthenticated) {
      setShowLoginPrompt(true);
      return;
    }
    setExporting(format);
    try {
      const result = await api.exportPublication(pub.id, format);
      if (result.downloadUrl) {
        const token = authService.getToken();
        const res = await fetch(result.downloadUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(res.statusText || 'Download failed');
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = result.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
      } else {
        const link = document.createElement('a');
        link.href = result.url;
        link.download = result.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      trackEvent('export', { format });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      console.error('Export failed:', err);
      setExportError(
        err instanceof Error
          ? err.message
          : t('projectInfo.exportError', { format: format.toUpperCase() })
      );
    } finally {
      setExporting(null);
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
                      route(`/catalog?author=${authorEntity.id}`);
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
                      route(`/catalog?translator=${translatorEntity.id}`);
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
                    route(`/catalog?tag=${entity.id}`);
                  }}
                />
              ))}
            </div>
          )}
          {langLabel && <p class="publication-page-lang">{langLabel}</p>}
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
            {translatedChapters.length > 0 && (
              <>
                <button
                  type="button"
                  class="publication-page-toc-btn"
                  onClick={() => handleExport('epub')}
                  disabled={exporting !== null}
                  title={t('export.epub')}
                >
                  {exporting === 'epub' ? (
                    '...'
                  ) : (
                    <>
                      <Icon name="menu_book" size="sm" />{' '}
                    </>
                  )}
                  {t('export.epub')}
                </button>
                <button
                  type="button"
                  class="publication-page-toc-btn"
                  onClick={() => handleExport('fb2')}
                  disabled={exporting !== null}
                  title={t('export.fb2')}
                >
                  {exporting === 'fb2' ? (
                    '...'
                  ) : (
                    <>
                      <Icon name="book_2" size="sm" />{' '}
                    </>
                  )}
                  {t('export.fb2')}
                </button>
              </>
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
                <div class="publication-page-chapter-filters">
                  <button
                    type="button"
                    class={chapterOrder === 'asc' ? 'active' : ''}
                    onClick={() => setChapterOrder('asc')}
                  >
                    <Icon name="arrow_upward" size="sm" /> {t('publication.orderFromStart')}
                  </button>
                  <button
                    type="button"
                    class={chapterOrder === 'desc' ? 'active' : ''}
                    onClick={() => setChapterOrder('desc')}
                  >
                    <Icon name="arrow_downward" size="sm" /> {t('publication.orderFromEnd')}
                  </button>
                </div>
                {showTranslationFilter && (
                  <div class="publication-page-chapter-filters">
                    <button
                      type="button"
                      class={translationFilter === 'translated' ? 'active' : ''}
                      onClick={() => setTranslationFilter('translated')}
                    >
                      <Icon name="translate" size="sm" /> {t('publication.filterTranslated')}
                    </button>
                    <button
                      type="button"
                      class={translationFilter === 'all' ? 'active' : ''}
                      onClick={() => setTranslationFilter('all')}
                    >
                      <Icon name="grid_view" size="sm" /> {t('publication.filterAll')}
                    </button>
                    <button
                      type="button"
                      class={translationFilter === 'untranslated' ? 'active' : ''}
                      onClick={() => setTranslationFilter('untranslated')}
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
                      onClick={() => setChapterFilter('all')}
                    >
                      <Icon name="grid_view" size="sm" /> {t('publication.filterAll')}
                    </button>
                    <button
                      type="button"
                      class={chapterFilter === 'unread' ? 'active' : ''}
                      onClick={() => setChapterFilter('unread')}
                    >
                      <Icon name="mark_email_unread" size="sm" /> {t('publication.filterUnread')}
                    </button>
                    <button
                      type="button"
                      class={chapterFilter === 'read' ? 'active' : ''}
                      onClick={() => setChapterFilter('read')}
                    >
                      <Icon name="check_circle" size="sm" /> {t('publication.filterRead')}
                    </button>
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
                              const isRead = readChapterIds.has(ch.id);
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
                        const isRead = readChapterIds.has(ch.id);
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
        readChapterIds={isAuthenticated ? readChapterIds : undefined}
        onSelectChapter={(chapterId) => {
          setShowToc(false);
          route(`/p/${pubPath}/chapters/${chapterId}/reading`);
        }}
      />
      <Modal
        isOpen={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        title={t('publication.exportLoginRequired')}
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
        <p class="publication-page-modal-text">{t('publication.exportLoginRequired')}</p>
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
