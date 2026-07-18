import { useEffect, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { api } from '../../api/client';
import { BookPlaceholder } from '../Dashboard/BookPlaceholder';
import { LoadingSpinner, Modal, Button, Icon } from '../ui';
import { buildReadingChapterUrl } from '../../utils/readingRoutes';
import '../Home/PublicationCard.css';
import '../../pages/HomePage.css';
import './QuotesSection.css';

export interface UserQuoteItem {
  id: string;
  publicationId: string;
  chapterId: string;
  chapterNumber: number;
  quoteText: string;
  startParagraph: number;
  createdAt: string;
  publicationTitle: string | null;
  publicationSlug: string | null;
  coverImageUrl: string | null;
}

function formatQuoteDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function QuotesSection() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<UserQuoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<UserQuoteItem | null>(null);

  const loadQuotes = () => {
    return api
      .getUserQuotes()
      .then(({ items: data }) => setItems(data))
      .catch(() => setItems([]));
  };

  useEffect(() => {
    let cancelled = false;
    loadQuotes().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpen = (item: UserQuoteItem) => {
    const path = item.publicationSlug || item.publicationId;
    const url = buildReadingChapterUrl({
      isPublicationMode: true,
      publicationPath: path,
      publicationId: item.publicationId,
      chapterId: item.chapterId,
      paragraphIndex: item.startParagraph > 0 ? item.startParagraph : undefined,
    });
    if (url) route(url);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteUserQuote(deleteTarget.id);
      setDeleteTarget(null);
      await loadQuotes();
    } catch {
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return (
      <div class="quotes-section-loading">
        <LoadingSpinner size="lg" text={t('profile.loadingQuotes')} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div class="quotes-section-empty">
        <div class="quotes-section-empty-icon" aria-hidden="true">
          <Icon name="format_quote" size="lg" />
        </div>
        <p class="quotes-section-empty-text">{t('profile.quotesEmpty')}</p>
        <p class="quotes-section-empty-hint">{t('profile.quotesEmptyHint')}</p>
      </div>
    );
  }

  return (
    <>
      <div class="quotes-section-list">
        {items.map((item) => (
          <article key={item.id} class="quotes-section-item">
            <div class="quotes-section-item-cover">
              {item.coverImageUrl ? (
                <img src={item.coverImageUrl} alt="" class="quotes-section-cover-img" />
              ) : (
                <BookPlaceholder title={item.publicationTitle ?? ''} />
              )}
            </div>
            <div class="quotes-section-item-body">
              <div class="quotes-section-item-meta">
                <h3 class="quotes-section-item-title">
                  {item.publicationTitle || t('profile.quotesUntitled')}
                </h3>
                <p class="quotes-section-item-chapter">
                  {t('profile.quotesChapterMeta', { number: item.chapterNumber })}
                  <span class="quotes-section-meta-sep" aria-hidden="true">
                    ·
                  </span>
                  {formatQuoteDate(item.createdAt, i18n.language)}
                </p>
              </div>
              <blockquote class="quotes-section-quote">«{item.quoteText}»</blockquote>
              <div class="quotes-section-actions">
                <Button variant="secondary" size="sm" onClick={() => handleOpen(item)}>
                  {t('profile.quotesOpen')}
                </Button>
                <button
                  type="button"
                  class="quotes-section-delete-link"
                  onClick={() => setDeleteTarget(item)}
                >
                  {t('profile.quotesDelete')}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <Modal
        isOpen={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        title={t('profile.quotesDeleteTitle')}
        className="quotes-delete-modal"
      >
        <p>{t('profile.quotesDeleteConfirm')}</p>
        <div class="form-actions">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={handleDelete}>
            {t('profile.quotesDelete')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
