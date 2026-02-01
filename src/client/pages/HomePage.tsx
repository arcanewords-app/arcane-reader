import { useEffect, useState, useCallback } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { api } from '../api/client';
import { authService } from '../services/authService';
import type { PublicationListItem, Publication } from '../types';
import { PublicationCard } from '../components/Home/PublicationCard';
import { LoadingSpinner } from '../components/ui';
import './HomePage.css';

type CatalogFilter = 'all' | 'mine';

function getFilterFromUrl(): CatalogFilter {
  if (typeof window === 'undefined') return 'all';
  const params = new URLSearchParams(window.location.search);
  return params.get('filter') === 'mine' ? 'mine' : 'all';
}

export function HomePage() {
  const { t } = useTranslation();
  const isAuthor = !!authService.getToken();
  const [filter, setFilter] = useState<CatalogFilter>(getFilterFromUrl);
  const [publications, setPublications] = useState<(PublicationListItem | Publication)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync filter from URL (e.g. browser back/forward)
  useEffect(() => {
    const handler = () => setFilter(getFilterFromUrl());
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    if (filter === 'mine' && isAuthor) {
      api
        .getUserPublications()
        .then((list) => {
          if (!cancelled) {
            const publishedOnly = list.filter((p) => p.status === 'published');
            setPublications(publishedOnly);
          }
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      api
        .getPublications({ limit: 50, orderBy: 'published_at', orderAsc: false })
        .then((list) => {
          if (!cancelled) setPublications(list);
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }

    return () => { cancelled = true; };
  }, [filter, isAuthor]);

  const switchToAll = useCallback(() => {
    setFilter('all');
    route('/catalog');
  }, []);

  const switchToMine = useCallback(() => {
    setFilter('mine');
    route('/catalog?filter=mine');
  }, []);

  const handleRead = useCallback((id: string) => {
    route(`/p/${id}`);
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
        </div>
      </div>
    );
  }

  const emptyHint = isMineTab
    ? t('home.emptyMyWorksHint')
    : isAuthor
      ? t('home.publishHint')
      : t('home.emptyHintGuest');
  const emptyTitle = isMineTab ? t('home.noMyPublications') : t('home.noPublications');

  return (
    <div class="home-page">
      {isAuthor && (
        <div class="home-nav">
          <a href="/cabinet" onClick={(e) => { e.preventDefault(); route('/cabinet'); }} class="home-back-cabinet">
            ← {t('cabinet.title')}
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
          <div class="home-empty-icon">📚</div>
          <p class="home-empty-text">{emptyTitle}</p>
          <p class="home-empty-hint">{emptyHint}</p>
        </div>
      ) : (
        <div class="home-grid">
          {publications.map((pub) => (
            <PublicationCard
              key={pub.id}
              publication={pub}
              onRead={() => handleRead(pub.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
