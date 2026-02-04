import { useTranslation } from 'react-i18next';
import type { Publication, PublicationListItem } from '../../types';
import { BookPlaceholder } from '../Dashboard/BookPlaceholder';
import './PublicationCard.css';

/** Card accepts both list item and full publication (e.g. from "My works" API). */
interface PublicationCardProps {
  publication: PublicationListItem | Publication;
  onRead: () => void;
}

export function PublicationCard({ publication, onRead }: PublicationCardProps) {
  const { t } = useTranslation();
  const title = publication.title || t('publication.untitled');
  const coverImageUrl = publication.coverImageUrl;
  const authorDisplay = publication.authorDisplay || null;
  const translatorDisplay = publication.translatorDisplay || null;
  const langLabel = `${publication.sourceLanguage} → ${publication.targetLanguage}`;
  const publishedAt = publication.publishedAt
    ? new Date(publication.publishedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <div class="publication-card">
      <div class="publication-card-cover">
        {coverImageUrl ? (
          <>
            <img
              src={coverImageUrl}
              alt={title}
              loading="lazy"
              decoding="async"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const placeholder = target.parentElement?.querySelector('.publication-card-placeholder');
                if (placeholder) placeholder.classList.remove('hidden');
              }}
              onLoad={(e) => {
                const target = e.target as HTMLImageElement;
                const placeholder = target.parentElement?.querySelector('.publication-card-placeholder');
                if (placeholder) placeholder.classList.add('hidden');
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
        <h3 class="publication-card-title">{title}</h3>
        {publication.description && (
          <p class="publication-card-description">{publication.description}</p>
        )}
        {(authorDisplay || translatorDisplay) ? (
          <div class="publication-card-authors">
            {authorDisplay && (
              <p class="publication-card-author">
                {t('publication.authorLabel')}: {authorDisplay}
              </p>
            )}
            {translatorDisplay && (
              <p class="publication-card-translator">
                {t('publication.translatorLabel')}: {translatorDisplay}
              </p>
            )}
          </div>
        ) : (
          <p class="publication-card-author">{t('publication.unknownAuthor')}</p>
        )}
        <p class="publication-card-lang">{langLabel}</p>
        {publishedAt && (
          <p class="publication-card-date">{publishedAt}</p>
        )}
        <button type="button" class="publication-card-read-btn" onClick={onRead}>
          {t('home.read')}
        </button>
      </div>
    </div>
  );
}
