import { useEffect, useState, useCallback, useMemo, useRef } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { api } from '../api/client';
import { authService } from '../services/authService';
import { useUserRole } from '../hooks/useUserRole';
import type { PublicationListItem, Publication, PublicEntity } from '../types';
import { PublicationCard } from '../components/Home/PublicationCard';
import { LoadingSpinner, Input, Select, Icon } from '../components/ui';
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
  const { isAtLeast } = useUserRole();
  const isAuthor = !!authService.getToken() && isAtLeast('author');
  const [filter, setFilter] = useState<CatalogFilter>(getFilterFromUrl);
  const [entityFilter, setEntityFilter] = useState(getEntityFilterFromUrl);
  const [entityFilterNames, setEntityFilterNames] = useState<{
    author?: string;
    translator?: string;
    tag?: string;
  }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('');
  const [orderAsc, setOrderAsc] = useState(false);
  const [publications, setPublications] = useState<(PublicationListItem | Publication)[]>([]);
  const [entityMap, setEntityMap] = useState<Record<string, PublicEntity | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const targetLanguageOptions = useMemo(() => {
    const codes = [
      ...new Set(publications.map((p) => p.targetLanguage).filter(Boolean)),
    ] as string[];
    codes.sort((a, b) => a.localeCompare(b));
    const options = [{ value: '', label: t('home.languageAll') }];
    codes.forEach((code) => {
      options.push({ value: code, label: t(`language.${code}`) || code.toUpperCase() });
    });
    return options;
  }, [publications, t]);

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
  }, [publications, filter, isAuthor, entityFilter, searchQuery, targetLanguage, orderAsc]);

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

    if (filter === 'mine' && isAuthor) {
      api
        .getUserPublications()
        .then((list) => {
          if (loadIdRef.current !== loadId) return;
          const publishedOnly = list.filter((p) => p.status === 'published');
          setPublications(publishedOnly);
          prefetchEntities(publishedOnly);
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

  const handleRead = useCallback((path: string) => {
    route(`/p/${path}`);
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
        <h1 class="home-title">{t('home.title')}</h1>
        <p class="home-subtitle">{t('home.subtitle')}</p>
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
            <div class="home-filters-actions">
              <div class="home-order-btns">
                <button
                  type="button"
                  class={`home-order-btn ${!orderAsc ? 'active' : ''}`}
                  onClick={() => setOrderAsc(false)}
                >
                  {t('home.orderNewest')}
                </button>
                <button
                  type="button"
                  class={`home-order-btn ${orderAsc ? 'active' : ''}`}
                  onClick={() => setOrderAsc(true)}
                >
                  {t('home.orderOldest')}
                </button>
              </div>
              <div class="home-language-filter">
                <Select
                  options={targetLanguageOptions}
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage((e.target as HTMLSelectElement).value)}
                  className="home-language-select"
                />
              </div>
            </div>
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
                {hasEntityFilter ? t('home.noPublicationsForFilter') : t('home.noSearchResults')}
              </p>
              <p class="home-empty-hint">
                {hasEntityFilter ? t('home.clearFilterHint') : t('home.noSearchResultsHint')}
              </p>
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
            <div class="home-grid">
              {filteredPublications.map((pub) => (
                <PublicationCard
                  key={pub.id}
                  publication={pub}
                  onRead={() => handleRead(pub.slug || pub.id)}
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
    </div>
  );
}
