import { useEffect, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { api } from '../../api/client';
import { BookPlaceholder } from '../Dashboard/BookPlaceholder';
import { LoadingSpinner, Modal, Button, Icon } from '../ui';
import '../Home/PublicationCard.css';
import '../../pages/HomePage.css';
import './ReadingHistorySection.css';

export interface ReadingHistoryItem {
  publicationId: string;
  title: string | null;
  coverImageUrl: string | null;
  slug: string | null;
  totalChapters: number;
  readCount: number;
  lastReadChapterNumber: number;
  continueChapterId: string | null;
  lastReadAt: string | null;
}

export function ReadingHistorySection() {
  const { t } = useTranslation();
  const [items, setItems] = useState<ReadingHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetTarget, setResetTarget] = useState<ReadingHistoryItem | null>(null);

  const loadHistory = () => {
    return api
      .getReadingHistory()
      .then(({ items: data }) => setItems(data))
      .catch(() => setItems([]));
  };

  useEffect(() => {
    let cancelled = false;
    loadHistory().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleContinue = (item: ReadingHistoryItem) => {
    const path = item.slug || item.publicationId;
    if (item.continueChapterId) {
      route(`/p/${path}/chapters/${item.continueChapterId}/reading`);
    } else {
      route(`/p/${path}`);
    }
  };

  const handleOpen = (item: ReadingHistoryItem) => {
    const path = item.slug || item.publicationId;
    route(`/p/${path}`);
  };

  const handleReset = async () => {
    if (!resetTarget) return;
    try {
      await api.resetReadProgress(resetTarget.publicationId);
      setResetTarget(null);
      await loadHistory();
    } catch {
      setResetTarget(null);
    }
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
        <div class="reading-history-empty-icon" aria-hidden="true">
          <Icon name="menu_book" size="lg" />
        </div>
        <p class="reading-history-empty-text">{t('profile.noReadingHistory')}</p>
        <p class="reading-history-empty-hint">{t('profile.noReadingHistoryHint')}</p>
      </div>
    );
  }

  return (
    <>
      <div class="home-grid">
        {items.map((item) => {
          const title = item.title || t('publication.untitled');
          return (
            <div key={item.publicationId} class="publication-card reading-history-card">
              <div
                class="publication-card-clickable"
                role="button"
                tabIndex={0}
                aria-label={t('home.openPublicationAria', { title })}
                onClick={() => handleOpen(item)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleOpen(item);
                  }
                }}
              >
                <div class="publication-card-cover">
                  {item.coverImageUrl ? (
                    <>
                      <img
                        src={item.coverImageUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const placeholder = target.parentElement?.querySelector(
                            '.publication-card-placeholder'
                          );
                          if (placeholder) {
                            placeholder.classList.remove('hidden');
                          }
                        }}
                      />
                      <div class="publication-card-placeholder hidden">
                        <BookPlaceholder projectName={title} projectType="book" />
                      </div>
                    </>
                  ) : (
                    <div class="publication-card-placeholder">
                      <BookPlaceholder projectName={title} projectType="book" />
                    </div>
                  )}
                </div>
                <div class="publication-card-content">
                  <div class="publication-card-main">
                    <h3 class="publication-card-title">{title}</h3>
                    <div class="reading-history-meta">
                      <span>
                        {item.readCount} / {item.totalChapters} {t('publication.chapters')}
                      </span>
                      {item.lastReadAt && (
                        <>
                          <span class="reading-history-meta-sep" aria-hidden="true">
                            ·
                          </span>
                          <span>
                            {t('profile.lastRead')}: {formatRelativeDate(item.lastReadAt, t)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                class="publication-card-read-btn"
                onClick={() => handleContinue(item)}
              >
                {item.continueChapterId ? t('profile.continue') : t('profile.open')}
              </button>
              <button
                type="button"
                class="reading-history-reset-link"
                onClick={() => setResetTarget(item)}
              >
                <Icon name="restart_alt" size="sm" />
                {t('readingProgress.reset')}
              </button>
            </div>
          );
        })}
      </div>

      <Modal
        isOpen={resetTarget != null}
        onClose={() => setResetTarget(null)}
        title={t('readingProgress.resetConfirmTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void handleReset()}>
              {t('readingProgress.resetConfirmYes')}
            </Button>
          </>
        }
      >
        <p>{t('readingProgress.resetConfirmBody')}</p>
      </Modal>
    </>
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
