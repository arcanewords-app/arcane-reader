import { useEffect, useState, useCallback, useMemo, useRef } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { api } from '../api/client';
import { authService, openAuthModal } from '../services/authService';
import { useUserRole } from '../hooks/useUserRole';
import type { PublicationListItem, Publication, PublicEntity } from '../types';
import { PublicationCard } from '../components/Home/PublicationCard';
import { CatalogFilterToolbar } from '../components/Home/CatalogFilterToolbar';
import { LoadingSpinner, Input, Icon, Button, Modal } from '../components/ui';
import { SuggestTranslationModal } from '../components/TranslationRequests/SuggestTranslationModal';
import './HomePage.css';

type CatalogFilter = 'all' | 'mine';

function getFilterFromUrl(): CatalogFilter {
  if (typeof window === 'undefined') return 'all';
  const params = new URLSearchParams(window.location.search);
  return params.get('filter') === 'mine' ? 'mine' : 'all';
}

function getEntityFilterFromUrl(): {
  author?: string;
  translator?: string;
  tag?: string;
} {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const author = params.get('author') || undefined;
  const translator = params.get('translator') || undefined;
  const tag = params.get('tag') || undefined;
  return { author, translator, tag };
}

function buildCatalogUrl(
  filter: CatalogFilter,
  entityFilter: {
    author?: string;
    translator?: string;
    tag?: string;
  }
): string {
  const params = new URLSearchParams();
  if (filter === 'mine') params.set('filter', 'mine');
  if (entityFilter.author) params.set('author', entityFilter.author);
  if (entityFilter.translator) params.set('translator', entityFilter.translator);
  if (entityFilter.tag) params.set('tag', entityFilter.tag);
  const q = params.toString();
  return q ? `/catalog?${q}` : '/catalog';
}

export function HomePage() {
  const { t } = useTranslation();
  const { user, isAtLeast } = useUserRole();
  const isAuthor = !!authService.getToken() && isAtLeast('author');
  const [showSuggestLoginPrompt, setShowSuggestLoginPrompt] = useState(false);
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const [filter, setFilter] = useState<CatalogFilter>(getFilterFromUrl);
  const [entityFilter, setEntityFilter] = useState(getEntityFilterFromUrl);
  const [entityFilterNames, setEntityFilterNames] = useState<{
    author?: string;
    translator?: string;
    tag?: string;
  }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('');
  const [completeOnly, setCompleteOnly] = useState(false);
  const [orderAsc, setOrderAsc] = useState(false);
  const [publications, setPublications] = useState<(PublicationListItem | Publication)[]>([]);
  const [entityMap, setEntityMap] = useState<Record<string, PublicEntity | null>>({});
  const [readingHistoryMap, setReadingHistoryMap] = useState<
    Record<string, { lastReadChapterId: string | null }>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const languageCodes = useMemo(() => {
    const codes = [
      ...new Set(publications.map((p) => p.targetLanguage).filter(Boolean)),
    ] as string[];
    codes.sort((a, b) => a.localeCompare(b));
    return codes;
  }, [publications]);

  const hasCompleteWorks = useMemo(
    () => publications.some((p) => p.translationStatus === 'complete'),
    [publications]
  );

  const filteredPublications = useMemo(() => {
    let list = publications;
    if (filter === 'mine' && isAuthor) {
      if (entityFilter.author) {
        list = list.filter((p) => (p as Publication).authorEntityId === entityFilter.author);
      }
      if (entityFilter.translator) {
        list = list.filter(
          (p) => (p as Publication).translatorEntityId === entityFilter.translator
        );
      }
      if (entityFilter.tag) {
        list = list.filter((p) => {
          const ids = (p as Publication).tagEntityIds ?? [];
          return ids.includes(entityFilter.tag!);
        });
      }
    }
    if (targetLanguage) {
      list = list.filter((p) => p.targetLanguage === targetLanguage);
    }
    if (completeOnly) {
      list = list.filter((p) => p.translationStatus === 'complete');
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((p) => {
        const title = (p.title || '').toLowerCase();
        const description = (p.description || '').toLowerCase();
        const author = (p.authorDisplay || '').toLowerCase();
        const translator = (p.translatorDisplay || '').toLowerCase();
        return (
          title.includes(q) ||
          description.includes(q) ||
          author.includes(q) ||
          translator.includes(q)
        );
      });
    }
    return [...list].sort((a, b) => {
      const ta = new Date(a.publishedAt || 0).getTime();
      const tb = new Date(b.publishedAt || 0).getTime();
      return orderAsc ? ta - tb : tb - ta;
    });
  }, [
    publications,
    filter,
    isAuthor,
    entityFilter,
    searchQuery,
    targetLanguage,
    completeOnly,
    orderAsc,
  ]);

  // Sync filter and entity params from URL (browser back/forward, route changes)
  useEffect(() => {
    const syncFromUrl = () => {
      setFilter(getFilterFromUrl());
      setEntityFilter(getEntityFilterFromUrl());
    };
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    const handleRouteChange = () => {
      const path = window.location.pathname;
      if (path === '/' || path === '/catalog') syncFromUrl();
    };
    window.addEventListener('arcane:route-change', handleRouteChange);
    return () => {
      window.removeEventListener('popstate', syncFromUrl);
      window.removeEventListener('arcane:route-change', handleRouteChange);
    };
  }, []);

  const loadIdRef = useRef(0);

  const loadData = useCallback(() => {
    const loadId = ++loadIdRef.current;
    setLoading(true);
    setError(null);

    const prefetchEntities = (list: (PublicationListItem | Publication)[]) => {
      const ids = new Set<string>();
      for (const p of list) {
        const authorId = (p as Publication).authorEntityId ?? p.authorEntityId;
        const translatorId = (p as Publication).translatorEntityId ?? p.translatorEntityId;
        if (authorId) ids.add(authorId);
        if (translatorId) ids.add(translatorId);
      }
      if (ids.size === 0) {
        setEntityMap({});
        return;
      }
      Promise.all([...ids].map((id) => api.getPublicEntityById(id))).then((results) => {
        if (loadIdRef.current !== loadId) return;
        const map: Record<string, PublicEntity | null> = {};
        [...ids].forEach((id, i) => {
          map[id] = results[i] ?? null;
        });
        setEntityMap(map);
      });
    };

    const hasAuth = !!authService.getToken();
    if (!hasAuth) setReadingHistoryMap({});
    const historyPromise = hasAuth
      ? api.getReadingHistory().catch(() => ({ items: [] }))
      : Promise.resolve({ items: [] });

    const loadHistory = () => {
      historyPromise.then(({ items }) => {
        if (loadIdRef.current !== loadId) return;
        const map: Record<string, { lastReadChapterId: string | null }> = {};
        items.forEach((item) => {
          map[item.publicationId] = { lastReadChapterId: item.lastReadChapterId };
        });
        setReadingHistoryMap(map);
      });
    };

    if (filter === 'mine' && isAuthor) {
      api
        .getUserPublications()
        .then((list) => {
          if (loadIdRef.current !== loadId) return;
          const publishedOnly = list.filter((p) => p.status === 'published');
          setPublications(publishedOnly);
          prefetchEntities(publishedOnly);
          loadHistory();
        })
        .catch((e) => {
          if (loadIdRef.current !== loadId) return;
          setError(e instanceof Error ? e.message : 'Failed to load');
        })
        .finally(() => {
          if (loadIdRef.current !== loadId) return;
          setLoading(false);
        });
    } else {
      api
        .getPublications({
          limit: 50,
          orderBy: 'published_at',
          orderAsc: false,
          authorEntityId: entityFilter.author,
          translatorEntityId: entityFilter.translator,
          tagEntityId: entityFilter.tag,
        })
        .then((list) => {
          if (loadIdRef.current !== loadId) return;
          setPublications(list);
          prefetchEntities(list);
          loadHistory();
        })
        .catch((e) => {
          if (loadIdRef.current !== loadId) return;
          setError(e instanceof Error ? e.message : 'Failed to load');
        })
        .finally(() => {
          if (loadIdRef.current !== loadId) return;
          setLoading(false);
        });
    }
  }, [filter, isAuthor, entityFilter]);

  // Fetch entity names for active filter chips
  useEffect(() => {
    const { author, translator, tag } = entityFilter;
    if (!author && !translator && !tag) {
      setEntityFilterNames({});
      return;
    }
    let cancelled = false;
    Promise.all([
      author ? api.getPublicEntityById(author) : Promise.resolve(null),
      translator ? api.getPublicEntityById(translator) : Promise.resolve(null),
      tag ? api.getPublicEntityById(tag) : Promise.resolve(null),
    ]).then(([authorEnt, translatorEnt, tagEnt]) => {
      if (cancelled) return;
      setEntityFilterNames({
        author: authorEnt?.name,
        translator: translatorEnt?.name,
        tag: tagEnt?.name,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [entityFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!hasCompleteWorks && completeOnly) {
      setCompleteOnly(false);
    }
  }, [hasCompleteWorks, completeOnly]);

  const switchToAll = useCallback(() => {
    setFilter('all');
    route(buildCatalogUrl('all', entityFilter));
  }, [entityFilter]);

  const switchToMine = useCallback(() => {
    setFilter('mine');
    route(buildCatalogUrl('mine', entityFilter));
  }, [entityFilter]);

  const clearEntityFilter = useCallback(() => {
    setEntityFilter({});
    route(buildCatalogUrl(filter, {}));
  }, [filter]);

  const clearEntityFilterByKey = useCallback(
    (key: 'author' | 'translator' | 'tag') => {
      const next = { ...entityFilter, [key]: undefined };
      setEntityFilter(next);
      route(buildCatalogUrl(filter, next));
    },
    [entityFilter, filter]
  );

  const handleRead = useCallback((path: string, chapterId?: string) => {
    if (chapterId) {
      route(`/p/${path}/chapters/${chapterId}/reading`);
    } else {
      route(`/p/${path}`);
    }
  }, []);

  const showMyWorksTab = isAuthor;
  const isMineTab = filter === 'mine';

  if (loading) {
    return (
      <div class="home-page">
        <div class="home-loading">
          <LoadingSpinner size="lg" text={t('home.loading')} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div class="home-page">
        <div class="home-error">
          <p>{t('home.error')}</p>
          <p class="home-error-detail">{error}</p>
          <button
            type="button"
            class="page-back-btn"
            onClick={loadData}
            style={{ marginTop: '1rem' }}
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  const hasEntityFilter =
    Boolean(entityFilter.author) || Boolean(entityFilter.translator) || Boolean(entityFilter.tag);
  const emptyHint = hasEntityFilter
    ? t('home.clearFilterHint')
    : isMineTab
      ? t('home.emptyMyWorksHint')
      : isAuthor
        ? t('home.publishHint')
        : t('home.emptyHintGuest');
  const emptyTitle = hasEntityFilter
    ? t('home.noPublicationsForFilter')
    : isMineTab
      ? t('home.noMyPublications')
      : t('home.noPublications');

  return (
    <div class="home-page">
      {isAuthor && (
        <div class="home-nav">
          <a
            href="/projects"
            onClick={(e) => {
              e.preventDefault();
              route('/projects');
            }}
            class="home-back-projects"
          >
            <Icon name="arrow_back" size="sm" /> {t('nav.projects')}
          </a>
        </div>
      )}
      <div class="home-header">
        <div class="home-header-top">
          <div>
            <h1 class="home-title">{t('home.title')}</h1>
            <p class="home-subtitle">{t('home.subtitle')}</p>
          </div>
          <Button
            variant="secondary"
            className="home-suggest-btn"
            onClick={() => {
              if (user) setShowSuggestModal(true);
              else setShowSuggestLoginPrompt(true);
            }}
          >
            <Icon name="add" size="sm" /> {t('home.suggestTranslation')}
          </Button>
        </div>
        {showMyWorksTab && (
          <div class="home-tabs" role="tablist">
            <button
              type="button"
              class={`home-tab ${!isMineTab ? 'home-tab-active' : ''}`}
              role="tab"
              aria-selected={!isMineTab}
              onClick={switchToAll}
            >
              {t('home.catalogTab')}
            </button>
            <button
              type="button"
              class={`home-tab ${isMineTab ? 'home-tab-active' : ''}`}
              role="tab"
              aria-selected={isMineTab}
              onClick={switchToMine}
            >
              {t('home.myWorksTab')}
            </button>
          </div>
        )}
      </div>

      {publications.length === 0 ? (
        <div class="home-empty">
          <div class="home-empty-icon">
            <Icon name="menu_book" />
          </div>
          <p class="home-empty-text">{emptyTitle}</p>
          <p class="home-empty-hint">{emptyHint}</p>
          {hasEntityFilter && (
            <button
              type="button"
              class="page-back-btn"
              onClick={clearEntityFilter}
              style={{ marginTop: '1rem' }}
            >
              {t('home.clearAllFilters')}
            </button>
          )}
        </div>
      ) : (
        <>
          <div class="home-filters">
            <div class="home-search">
              <Input
                placeholder={t('home.searchPlaceholder')}
                value={searchQuery}
                onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
                className="home-search-input"
              />
            </div>
            <CatalogFilterToolbar
              targetLanguage={targetLanguage}
              onTargetLanguageChange={setTargetLanguage}
              languageCodes={languageCodes}
              completeOnly={completeOnly}
              onCompleteOnlyChange={setCompleteOnly}
              showCompleteFilter={hasCompleteWorks}
              orderAsc={orderAsc}
              onOrderAscChange={setOrderAsc}
            />
          </div>
          {hasEntityFilter && (
            <div class="home-entity-filters">
              {entityFilter.author && (
                <span class="home-entity-chip">
                  {t('home.filterByAuthor')}: {entityFilterNames.author ?? entityFilter.author}
                  <button
                    type="button"
                    class="home-entity-chip-remove"
                    onClick={() => clearEntityFilterByKey('author')}
                    aria-label={t('home.clearFilter')}
                  >
                    ×
                  </button>
                </span>
              )}
              {entityFilter.translator && (
                <span class="home-entity-chip">
                  {t('home.filterByTranslator')}:{' '}
                  {entityFilterNames.translator ?? entityFilter.translator}
                  <button
                    type="button"
                    class="home-entity-chip-remove"
                    onClick={() => clearEntityFilterByKey('translator')}
                    aria-label={t('home.clearFilter')}
                  >
                    ×
                  </button>
                </span>
              )}
              {entityFilter.tag && (
                <span class="home-entity-chip">
                  {t('home.filterByTag')}: {entityFilterNames.tag ?? entityFilter.tag}
                  <button
                    type="button"
                    class="home-entity-chip-remove"
                    onClick={() => clearEntityFilterByKey('tag')}
                    aria-label={t('home.clearFilter')}
                  >
                    ×
                  </button>
                </span>
              )}
              <button type="button" class="home-entity-chip-clear-all" onClick={clearEntityFilter}>
                {t('home.clearAllFilters')}
              </button>
            </div>
          )}
          {filteredPublications.length === 0 ? (
            <div class="home-empty home-empty-filtered">
              <p class="home-empty-text">
                {completeOnly
                  ? t('home.noCompleteWorks')
                  : hasEntityFilter
                    ? t('home.noPublicationsForFilter')
                    : t('home.noSearchResults')}
              </p>
              <p class="home-empty-hint">
                {completeOnly
                  ? t('home.noCompleteWorksHint')
                  : hasEntityFilter
                    ? t('home.clearFilterHint')
                    : t('home.noSearchResultsHint')}
              </p>
              {completeOnly && (
                <button
                  type="button"
                  class="page-back-btn"
                  onClick={() => setCompleteOnly(false)}
                  style={{ marginTop: '1rem' }}
                >
                  {t('home.clearFilter')}
                </button>
              )}
              {!completeOnly && hasEntityFilter && (
                <button
                  type="button"
                  class="page-back-btn"
                  onClick={clearEntityFilter}
                  style={{ marginTop: '1rem' }}
                >
                  {t('home.clearAllFilters')}
                </button>
              )}
            </div>
          ) : (
            <div class="home-grid">
              {filteredPublications.map((pub) => (
                <PublicationCard
                  key={pub.id}
                  publication={pub}
                  onRead={(path, chapterId) => handleRead(path, chapterId)}
                  readingProgress={readingHistoryMap[pub.id]}
                  authorEntity={pub.authorEntityId ? entityMap[pub.authorEntityId] : undefined}
                  translatorEntity={
                    pub.translatorEntityId ? entityMap[pub.translatorEntityId] : undefined
                  }
                />
              ))}
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={showSuggestLoginPrompt}
        onClose={() => setShowSuggestLoginPrompt(false)}
        title={t('home.suggestTranslationLoginTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowSuggestLoginPrompt(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowSuggestLoginPrompt(false);
                openAuthModal({ mode: 'login', redirect: '/catalog' });
              }}
            >
              {t('auth.login')}
            </Button>
            <Button
              onClick={() => {
                setShowSuggestLoginPrompt(false);
                openAuthModal({ mode: 'register', redirect: '/catalog' });
              }}
            >
              {t('header.register')}
            </Button>
          </>
        }
      >
        <p>{t('home.suggestTranslationLoginMessage')}</p>
      </Modal>

      <SuggestTranslationModal
        isOpen={showSuggestModal}
        onClose={() => setShowSuggestModal(false)}
      />
    </div>
  );
}
