import { useEffect, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { api } from '../../api/client';
import { BookPlaceholder } from '../Dashboard/BookPlaceholder';
import { LoadingSpinner } from '../ui';
import './ReadingHistorySection.css';

export interface ReadingHistoryItem {
  publicationId: string;
  title: string | null;
  coverImageUrl: string | null;
  slug: string | null;
  totalChapters: number;
  readCount: number;
  lastReadChapterId: string | null;
  lastReadAt: string | null;
}

export function ReadingHistorySection() {
  const { t } = useTranslation();
  const [items, setItems] = useState<ReadingHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .getReadingHistory()
      .then(({ items: data }) => {
        if (!cancelled) setItems(data);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleContinue = (item: ReadingHistoryItem) => {
    const path = item.slug || item.publicationId;
    if (item.lastReadChapterId) {
      route(`/p/${path}/chapters/${item.lastReadChapterId}/reading`);
    } else {
      route(`/p/${path}`);
    }
  };

  const handleOpen = (item: ReadingHistoryItem) => {
    const path = item.slug || item.publicationId;
    route(`/p/${path}`);
  };

  if (loading) {
    return (
      <div class="reading-history-loading">
        <LoadingSpinner size="lg" text={t('profile.loadingReadingHistory')} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div class="reading-history-empty">
        <div class="reading-history-empty-icon">📖</div>
        <p class="reading-history-empty-text">{t('profile.noReadingHistory')}</p>
        <p class="reading-history-empty-hint">{t('profile.noReadingHistoryHint')}</p>
      </div>
    );
  }

  return (
    <div class="reading-history-grid">
      {items.map((item) => (
        <div
          key={item.publicationId}
          class="reading-history-card"
          role="button"
          tabIndex={0}
          onClick={() => handleOpen(item)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleOpen(item);
            }
          }}
        >
          <div class="reading-history-card-cover">
            {item.coverImageUrl ? (
              <img
                src={item.coverImageUrl}
                alt={item.title || ''}
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const placeholder = target.parentElement?.querySelector(
                    '.reading-history-card-placeholder'
                  );
                  if (placeholder) {
                    placeholder.classList.remove('hidden');
                  }
                }}
              />
            ) : null}
            <div
              class={`reading-history-card-placeholder ${item.coverImageUrl ? 'hidden' : ''}`}
            >
              <BookPlaceholder
                projectName={item.title || item.publicationId}
                projectType="book"
              />
            </div>
          </div>
          <div class="reading-history-card-body">
            <h3 class="reading-history-card-title">{item.title || t('publication.untitled')}</h3>
            <div class="reading-history-card-progress">
              {item.readCount} / {item.totalChapters} {t('publication.chapters')}
            </div>
            {item.lastReadAt && (
              <div class="reading-history-card-date">
                {t('profile.lastRead')}: {formatRelativeDate(item.lastReadAt, t)}
              </div>
            )}
            <div class="reading-history-card-actions">
              <button
                type="button"
                class="reading-history-btn reading-history-btn-continue"
                onClick={(e) => {
                  e.stopPropagation();
                  handleContinue(item);
                }}
              >
                {item.lastReadChapterId ? t('profile.continue') : t('profile.open')}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatRelativeDate(iso: string, t: (key: string) => string): string {
  const date = new Date(iso);
  const now = new Date();
  const daysAgo = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (daysAgo === 0) return t('projectCard.today');
  if (daysAgo === 1) return t('projectCard.yesterday');
  return t('projectCard.daysAgo', { count: daysAgo });
}
