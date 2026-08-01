import { useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { api } from '../../api/client';
import { BookPlaceholder } from '../Dashboard/BookPlaceholder';
import { LoadingSpinner, Modal, Button, Icon } from '../ui';
import { useReadingHistory, type ReadingHistoryItem } from '../../hooks/useReadingHistory';
import '../Home/PublicationCard.css';
import '../../pages/HomePage.css';
import './ReadingHistorySection.css';

export type { ReadingHistoryItem };

export function ReadingHistorySection() {
  const { t } = useTranslation();
  const { items, loading, reload, removeItem } = useReadingHistory();
  const [resetTarget, setResetTarget] = useState<ReadingHistoryItem | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

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
    const publicationId = resetTarget.publicationId;
    setResetError(null);
    setResetting(true);
    removeItem(publicationId);
    try {
      await api.resetReadProgress(publicationId);
      setResetTarget(null);
      await reload();
    } catch {
      setResetError(t('readingProgress.resetFailed'));
      await reload();
    } finally {
      setResetting(false);
    }
  };

  const openResetModal = (item: ReadingHistoryItem) => {
    setResetError(null);
    setResetTarget(item);
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
                onClick={() => openResetModal(item)}
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
        onClose={() => {
          if (!resetting) setResetTarget(null);
        }}
        title={t('readingProgress.resetConfirmTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetTarget(null)} disabled={resetting}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void handleReset()} loading={resetting}>
              {t('readingProgress.resetConfirmYes')}
            </Button>
          </>
        }
      >
        <p>{t('readingProgress.resetConfirmBody')}</p>
        {resetError && (
          <p class="reading-history-reset-error" role="alert">
            {resetError}
          </p>
        )}
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
