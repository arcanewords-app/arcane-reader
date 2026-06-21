import { useState, useCallback } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { Publication, PublicationListItem, PublicEntity } from '../../types';
import { BookPlaceholder } from '../Dashboard/BookPlaceholder';
import { EntityChip } from './EntityChip';
import { PublicationStatusBadge } from './PublicationStatusBadge';
import { trackEvent } from '../../utils/analytics';
import './PublicationCard.css';

/** Card accepts both list item and full publication (e.g. from "My works" API). */
interface PublicationCardProps {
  publication: PublicationListItem | Publication;
  onRead: (path: string, chapterId?: string) => void;
  /** Reading progress for "Continue" button (when user has read this publication). */
  readingProgress?: { lastReadChapterId: string | null };
  /** Prefetched entities for instant popup on hover. */
  authorEntity?: PublicEntity | null;
  translatorEntity?: PublicEntity | null;
}

export function PublicationCard({
  publication,
  onRead,
  readingProgress,
  authorEntity,
  translatorEntity,
}: PublicationCardProps) {
  const { t } = useTranslation();
  const [showDescTooltip, setShowDescTooltip] = useState(false);

  const title = publication.title || t('publication.untitled');
  const coverImageUrl = publication.coverImageUrl;
  const authorDisplay = publication.authorDisplay || null;
  const translatorDisplay = publication.translatorDisplay || null;
  const authorEntityId = publication.authorEntityId ?? null;
  const translatorEntityId = publication.translatorEntityId ?? null;
  const targetLanguage = publication.targetLanguage;
  const langLabel = targetLanguage
    ? t('publication.languageLabel', {
        language: t(`language.${targetLanguage}`) || targetLanguage.toUpperCase(),
      })
    : null;

  const translatedChapterCount =
    'translatedChapterCount' in publication ? publication.translatedChapterCount : undefined;

  const translationStatus = publication.translationStatus ?? null;

  const declension = (n: number, forms: [string, string, string]) => {
    const n10 = n % 10;
    const n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
    return forms[2];
  };
  const chapterForms: [string, string, string] = [
    t('project.chapterOne'),
    t('project.chapterFew'),
    t('project.chapterMany'),
  ];

  const handleDescMouseEnter = useCallback(() => setShowDescTooltip(true), []);
  const handleDescMouseLeave = useCallback(() => setShowDescTooltip(false), []);

  const pubPath = publication.slug || publication.id;
  const lastChapterId = readingProgress?.lastReadChapterId ?? undefined;

  const openPublication = useCallback(() => {
    trackEvent('select_content', {
      content_type: 'publication',
      item_id: publication.id,
    });
    onRead(pubPath);
  }, [publication.id, onRead, pubPath]);

  const handleCardAreaKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPublication();
      }
    },
    [openPublication]
  );

  const handleReadOrContinueClick = useCallback(() => {
    trackEvent('select_content', {
      content_type: 'publication',
      item_id: publication.id,
    });
    if (lastChapterId) {
      onRead(pubPath, lastChapterId);
    } else {
      onRead(pubPath);
    }
  }, [publication.id, lastChapterId, onRead, pubPath]);

  return (
    <div class="publication-card">
      <div
        class="publication-card-clickable"
        role="button"
        tabIndex={0}
        aria-label={t('home.openPublicationAria', { title })}
        onClick={openPublication}
        onKeyDown={handleCardAreaKeyDown}
      >
        <div class="publication-card-cover">
          {translationStatus && <PublicationStatusBadge status={translationStatus} />}
          {coverImageUrl ? (
            <>
              <img
                src={coverImageUrl}
                alt=""
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const placeholder = target.parentElement?.querySelector(
                    '.publication-card-placeholder'
                  );
                  if (placeholder) placeholder.classList.remove('hidden');
                }}
                onLoad={(e) => {
                  const target = e.target as HTMLImageElement;
                  const placeholder = target.parentElement?.querySelector(
                    '.publication-card-placeholder'
                  );
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
          <div class="publication-card-main">
            <h3 class="publication-card-title">{title}</h3>
            {publication.description && (
              <div
                class="publication-card-description-wrap"
                onMouseEnter={handleDescMouseEnter}
                onMouseLeave={handleDescMouseLeave}
              >
                <p class="publication-card-description">{publication.description}</p>
                {showDescTooltip && (
                  <div class="publication-card-tooltip" role="tooltip">
                    {publication.description}
                  </div>
                )}
              </div>
            )}
          </div>
          <div class="publication-card-tags">
            {authorDisplay || translatorDisplay ? (
              <>
                <div class="publication-card-chip-row">
                  <EntityChip
                    display={authorDisplay}
                    entityId={authorEntityId}
                    routeParam="author"
                    entity={authorEntity}
                  />
                </div>
                <div class="publication-card-chip-row">
                  <EntityChip
                    display={translatorDisplay}
                    entityId={translatorEntityId}
                    routeParam="translator"
                    entity={translatorEntity}
                  />
                </div>
              </>
            ) : (
              <p class="publication-card-meta-fallback">{t('publication.unknownAuthor')}</p>
            )}
            {langLabel && (
              <div class="publication-card-chip-row">
                <span class="publication-card-lang-badge">{langLabel}</span>
                {translatedChapterCount != null && translatedChapterCount > 0 && (
                  <>
                    <span class="publication-card-meta-sep">·</span>
                    <span class="publication-card-chapters-badge">
                      {translatedChapterCount} {declension(translatedChapterCount, chapterForms)}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <button type="button" class="publication-card-read-btn" onClick={handleReadOrContinueClick}>
        {lastChapterId ? t('profile.continue') : t('home.read')}
      </button>
    </div>
  );
}
