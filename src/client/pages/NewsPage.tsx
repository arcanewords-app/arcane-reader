import { useEffect, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { api } from '../api/client';
import type { NewsPost, NewsCategory } from '../types';
import { LoadingSpinner } from '../components/ui';
import './InfoPages.css';
import './NewsPages.css';

const categoryKeys: Record<NewsCategory, string> = {
  feature: 'news.category.feature',
  discount: 'news.category.discount',
  update: 'news.category.update',
  other: 'news.category.other',
};

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return '';
  }
}

export function NewsPage() {
  const { t } = useTranslation();
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getNewsPosts({ limit: 50 })
      .then(setPosts)
      .catch(() => setError(t('news.loadError')))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <div class="info-page news-page">
      <div class="info-page-content">
        <button
          type="button"
          class="info-page-back"
          onClick={() => route('/')}
          aria-label={t('common.back')}
        >
          ← {t('common.back')}
        </button>

        <h1 class="info-page-title">{t('news.title')}</h1>
        <p class="info-page-intro">{t('news.intro')}</p>

        {loading && (
          <div class="news-page-loading">
            <LoadingSpinner size="md" />
          </div>
        )}

        {error && <p class="news-page-error">{error}</p>}

        {!loading && !error && posts.length === 0 && (
          <p class="news-page-empty">{t('news.empty')}</p>
        )}

        {!loading && !error && posts.length > 0 && (
          <ul class="news-list">
            {posts.map((post) => {
              const href = `/news/${post.slug || post.id}`;
              return (
                <li key={post.id} class="news-list-item">
                  <a
                    href={href}
                    class="news-list-link"
                    onClick={(e) => {
                      e.preventDefault();
                      route(href);
                    }}
                  >
                    <div class="news-list-meta">
                      <span class={`news-category news-category--${post.category}`}>
                        {t(categoryKeys[post.category])}
                      </span>
                      {post.publishedAt && (
                        <time class="news-list-date" dateTime={post.publishedAt}>
                          {formatDate(post.publishedAt)}
                        </time>
                      )}
                    </div>
                    <h2 class="news-list-title">{post.title}</h2>
                    <p class="news-list-summary">{post.summary}</p>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
