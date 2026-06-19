import { useEffect, useRef, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { api, ApiError } from '../api/client';
import { useAnnouncement } from '../contexts/AnnouncementContext';
import type { NewsPost, NewsCategory } from '../types';
import { trackAnnouncementDismiss } from '../utils/analytics';
import { LoadingSpinner } from '../components/ui';
import { renderSimpleMarkdown } from '../utils/simpleMarkdown';
import './InfoPages.css';
import './NewsPages.css';

const categoryKeys: Record<NewsCategory, string> = {
  feature: 'news.category.feature',
  discount: 'news.category.discount',
  update: 'news.category.update',
  other: 'news.category.other',
};

interface NewsDetailPageProps {
  slugOrId?: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return '';
  }
}

export function NewsDetailPage({ slugOrId }: NewsDetailPageProps) {
  const { t } = useTranslation();
  const { alert, dismiss } = useAnnouncement();
  const [post, setPost] = useState<NewsPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const dismissedForPostRef = useRef<string | null>(null);

  useEffect(() => {
    if (!slugOrId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setNotFound(false);
    api
      .getNewsPost(slugOrId)
      .then(setPost)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        }
        setPost(null);
      })
      .finally(() => setLoading(false));
  }, [slugOrId]);

  useEffect(() => {
    if (!post || !alert?.newsPostId || post.id !== alert.newsPostId) return;
    const dismissKey = `${alert.id}:${alert.contentVersion}:${post.id}`;
    if (dismissedForPostRef.current === dismissKey) return;
    dismissedForPostRef.current = dismissKey;
    trackAnnouncementDismiss(alert);
    dismiss();
  }, [post, alert, dismiss]);

  return (
    <div class="info-page news-page">
      <div class="info-page-content">
        <button
          type="button"
          class="info-page-back"
          onClick={() => route('/news')}
          aria-label={t('common.back')}
        >
          ← {t('news.backToList')}
        </button>

        {loading && (
          <div class="news-page-loading">
            <LoadingSpinner size="md" />
          </div>
        )}

        {notFound && !loading && <p class="news-page-error">{t('news.notFound')}</p>}

        {post && !loading && (
          <article class="news-article">
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
            <h1 class="info-page-title">{post.title}</h1>
            <p class="news-article-summary">{post.summary}</p>
            {post.body.trim() && (
              <div
                class="news-article-body"
                dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(post.body) }}
              />
            )}
          </article>
        )}
      </div>
    </div>
  );
}
