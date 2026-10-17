import { useState, useCallback, useRef } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type {
  Publication,
  PublicationListItem,
  PublicEntity,
} from '../../types';
import { BookPlaceholder } from '../Dashboard/BookPlaceholder';
import { AnchoredCardPopup } from './AnchoredCardPopup';
import { EntityChip } from './EntityChip';
import { PublicationStatusBadge } from './PublicationStatusBadge';
import { PublicationRatingCoverBadge } from './PublicationRatingCoverBadge';
import { trackEvent } from '../../utils/analytics';
import {
  ESTIMATED_DESCRIPTION_POPUP_HEIGHT,
  ESTIMATED_DESCRIPTION_POPUP_WIDTH,
} from '../../hooks/anchoredPopupPlacement';
import '../../styles/components/card-content-popup.css';
import './PublicationCard.css';

/** Card accepts both list item and full publication (e.g. from "My works" API). */
interface PublicationCardProps {
  publication: PublicationListItem | Publication;
  onRead: (path: string, chapterId?: string, lang?: string) => void;
  /** Reading progress for "Continue" button (when user has read this publication). */
  readingProgress?: { lastReadChapterNumber: number; continueChapterId?: string | null };
  /** Prefetched entities for instant popup on hover. */
  authorEntity?: PublicEntity | null;
  translatorEntity?: PublicEntity | null;
  /** Catalog language filter. Card click opens this language when the book has it. */
  catalogLanguage?: string;
}

export function PublicationCard({
  publication,
  onRead,
  readingProgress,
  authorEntity,
  translatorEntity,
  catalogLanguage,
}: PublicationCardProps) {
  const { t } = useTranslation();
  const [showDescTooltip, setShowDescTooltip] = useState(false);
  const descWrapRef = useRef<HTMLDivElement>(null);
  const previewTextRef = useRef<HTMLDivElement>(null);

  const title = publication.title || t('publication.untitled');
  const coverImageUrl = publication.coverImageUrl;
  const authorDisplay = publication.authorDisplay || null;
  const translatorDisplay = publication.translatorDisplay || null;
  const authorEntityId = publication.authorEntityId ?? null;
  const translatorEntityId = publication.translatorEntityId ?? null;
  const targetLanguage = publication.targetLanguage;
  const langLabel = targetLanguage
    ? t(`language.${targetLanguage}`) || targetLanguage.toUpperCase()
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
  const hasProgress =
    (readingProgress?.lastReadChapterNumber ?? 0) > 0 && !!readingProgress?.continueChapterId;
  const continueChapterId = readingProgress?.continueChapterId ?? undefined;

  const editions = publication.editions ?? [];
  const openLang =
    catalogLanguage &&
    catalogLanguage !== targetLanguage &&
    editions.some((edition) => edition.language === catalogLanguage)
      ? catalogLanguage
      : undefined;

  const openPublication = useCallback(() => {
    trackEvent('select_content', {
      content_type: 'publication',
      item_id: publication.id,
    });
    if (openLang) onRead(pubPath, undefined, openLang);
    else onRead(pubPath);
  }, [publication.id, onRead, pubPath, openLang]);

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
    if (continueChapterId) {
      onRead(pubPath, continueChapterId);
    } else {
      onRead(pubPath);
    }
  }, [publication.id, continueChapterId, onRead, pubPath]);

  return (
    <div class="publication-card">
      <div
        class="publication-card-clickable"
        role="button"
        tabIndex={0}
        data-testid="publication-card"
        aria-label={t('home.openPublicationAria', { title })}
        onClick={openPublication}
        onKeyDown={handleCardAreaKeyDown}
      >
        <div class="publication-card-cover">
          {(() => {
            const raw =
              catalogLanguage && catalogLanguage !== targetLanguage
                ? (editions.find((edition) => edition.language === catalogLanguage)
                    ?.translationStatus ?? translationStatus)
                : translationStatus;
            const badgeStatus =
              raw === 'in_progress' ||
              raw === 'complete' ||
              raw === 'abandoned' ||
              raw === 'experimental'
                ? raw
                : null;
            return badgeStatus ? <PublicationStatusBadge status={badgeStatus} /> : null;
          })()}
          <PublicationRatingCoverBadge
            ratingAvg={publication.ratingAvg}
            ratingCount={publication.ratingCount}
          />
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
                ref={descWrapRef}
                class="publication-card-description-wrap"
                onMouseEnter={handleDescMouseEnter}
                onMouseLeave={handleDescMouseLeave}
              >
                <p class="publication-card-description">{publication.description}</p>
                {showDescTooltip && (
                  <AnchoredCardPopup
                    open
                    anchorRef={descWrapRef}
                    estimatedHeight={ESTIMATED_DESCRIPTION_POPUP_HEIGHT}
                    estimatedWidth={ESTIMATED_DESCRIPTION_POPUP_WIDTH}
                    className="card-content-popup--description"
                    previewRef={previewTextRef}
                  >
                    <div class="card-content-popup__preview-text" ref={previewTextRef}>
                      {publication.description}
                    </div>
                  </AnchoredCardPopup>
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
            {editions.length > 0 ? (
              <div class="publication-card-chip-row publication-card-chip-row--meta">
                {[targetLanguage, ...editions.map((edition) => edition.language)]
                  .filter((code): code is string => !!code)
                  .map((code) => {
                    const edition = editions.find((item) => item.language === code);
                    const complete =
                      (edition?.translationStatus ?? translationStatus) === 'complete';
                    const active = code === (openLang ?? targetLanguage);
                    return (
                      <button
                        key={code}
                        type="button"
                        class="edition-language-switch-btn"
                        aria-pressed={active}
                        onClick={(event) => {
                          event.stopPropagation();
                          const lang = code === targetLanguage ? undefined : code;
                          onRead(pubPath, undefined, lang);
                        }}
                      >
                        {code.toUpperCase()}
                        {code !== targetLanguage ? (complete ? '●' : '○') : ''}
                      </button>
                    );
                  })}
              </div>
            ) : (
              langLabel && (
                <div class="publication-card-chip-row publication-card-chip-row--meta">
                  <span class="publication-card-lang-badge">{langLabel}</span>
                </div>
              )
            )}
            {translatedChapterCount != null && translatedChapterCount > 0 && (
              <div class="publication-card-chip-row publication-card-chip-row--meta">
                <span class="publication-card-chapters-badge">
                  {translatedChapterCount} {declension(translatedChapterCount, chapterForms)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      <button type="button" class="publication-card-read-btn" onClick={handleReadOrContinueClick}>
        {hasProgress ? t('profile.continue') : t('home.read')}
      </button>
    </div>
  );
}
