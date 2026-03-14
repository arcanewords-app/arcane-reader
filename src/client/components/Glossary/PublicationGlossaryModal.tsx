import { useState, useMemo, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import type { GlossaryEntry, GlossaryEntryType } from '../../types';
import { Modal, Button, LoadingSpinner, Icon } from '../ui';
import { api } from '../../api/client';
import './GlossaryModal.css';
import './PublicationGlossaryModal.css';

type FilterType = 'all' | GlossaryEntryType;

export interface PublicationChapterRef {
  id: string;
  number: number;
  title: string;
}

interface PublicationGlossaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  publicationId: string;
  /** Only chapters with translations (for clickable "go to chapter" pills). */
  chapters?: PublicationChapterRef[];
  /** Preloaded entries (e.g. from parent). When set, modal opens without loading. */
  preloadedEntries?: GlossaryEntry[] | null;
}

const typeIcons: Record<GlossaryEntryType, string> = {
  character: 'person',
  location: 'place',
  term: 'menu_book',
};

export function PublicationGlossaryModal({
  isOpen,
  onClose,
  publicationId,
  chapters = [],
  preloadedEntries,
}: PublicationGlossaryModalProps) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<GlossaryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [detailEntry, setDetailEntry] = useState<GlossaryEntry | null>(null);
  const [pendingChapter, setPendingChapter] = useState<{
    chapterId: string;
    number: number;
    title: string;
  } | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [retryTrigger, setRetryTrigger] = useState(0);

  const typeLabels: Record<GlossaryEntryType, string> = {
    character: t('glossary.characters'),
    location: t('glossary.locations'),
    term: t('glossary.terms'),
  };

  useEffect(() => {
    if (!isOpen || !publicationId) return;
    const usePreloaded = Array.isArray(preloadedEntries) && retryTrigger === 0;
    if (usePreloaded) {
      setEntries(preloadedEntries);
      setLoadError(false);
      setLoading(false);
      return;
    }
    setLoadError(false);
    setLoading(true);
    api
      .getPublicationGlossary(publicationId)
      .then((list) => setEntries(list))
      .catch(() => {
        setLoadError(true);
        setEntries([]);
      })
      .finally(() => setLoading(false));
  }, [isOpen, publicationId, retryTrigger, preloadedEntries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const matchesFilter = filter === 'all' || entry.type === filter;
      const matchesSearch =
        !search ||
        entry.original.toLowerCase().includes(search.toLowerCase()) ||
        entry.translated.toLowerCase().includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [entries, filter, search]);

  const counts = useMemo(
    () => ({
      all: entries.length,
      character: entries.filter((e) => e.type === 'character').length,
      location: entries.filter((e) => e.type === 'location').length,
      term: entries.filter((e) => e.type === 'term').length,
    }),
    [entries]
  );

  const handleRetry = () => setRetryTrigger((t) => t + 1);

  const openGoToChapterConfirm = (chapterNum: number) => {
    const ch = chapters.find((c) => c.number === chapterNum);
    if (!ch) return;
    setPendingChapter({
      chapterId: ch.id,
      number: chapterNum,
      title: ch.title || String(chapterNum),
    });
  };

  const confirmGoToChapter = () => {
    if (!pendingChapter) return;
    setDetailEntry(null);
    setPendingChapter(null);
    onClose();
    route(`/p/${publicationId}/chapters/${pendingChapter.chapterId}/reading`);
  };

  const renderChapterPills = (mentionedInChapters: number[] | undefined) => {
    if (!mentionedInChapters?.length) return null;
    return (
      <div class="glossary-card-chapters" title={t('glossary.chaptersMentionedLabel')}>
        {mentionedInChapters.map((num) => {
          const ch = chapters.find((c) => c.number === num);
          const isClickable = !!ch;
          return isClickable ? (
            <button
              key={num}
              type="button"
              class="glossary-chapter-pill"
              title={ch ? `${num}: ${ch.title}` : String(num)}
              onClick={(e) => {
                e.stopPropagation();
                openGoToChapterConfirm(num);
              }}
            >
              {num}
            </button>
          ) : (
            <span
              key={num}
              class="glossary-chapter-pill glossary-chapter-pill-static"
              title={t('glossary.chapterNotTranslated')}
            >
              {num} ({t('glossary.chapterNotTranslated')})
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={t('glossary.title')}
        size="large"
        className="glossary-viewer-readonly publication-glossary-modal"
        footer={
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
        }
      >
        {loading ? (
          <div class="glossary-empty">
            <LoadingSpinner size="md" text={t('common.loading')} />
          </div>
        ) : loadError ? (
          <div class="glossary-empty">
            <p>{t('glossary.loadError')}</p>
            <Button variant="secondary" onClick={handleRetry} style={{ marginTop: '1rem' }}>
              {t('common.retry')}
            </Button>
          </div>
        ) : (
          <>
            <div class="glossary-toolbar">
              <div class="glossary-search">
                <input
                  type="text"
                  class="form-input"
                  placeholder={t('glossary.searchPlaceholder')}
                  value={search}
                  onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
                />
              </div>
              <div class="glossary-filters">
                {(['all', 'character', 'location', 'term'] as FilterType[]).map((f) => (
                  <button
                    key={f}
                    class={`filter-btn ${filter === f ? 'active' : ''}`}
                    onClick={() => setFilter(f)}
                  >
                    {f === 'all' ? (
                      t('glossary.all')
                    ) : (
                      <>
                        <Icon name={typeIcons[f]} size="sm" /> {typeLabels[f]}
                      </>
                    )}
                    <span>{counts[f]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div class="glossary-grid">
              {filteredEntries.length === 0 ? (
                <div class="glossary-empty">
                  <div class="glossary-empty-icon">
                    <Icon name="menu_book" />
                  </div>
                  <p>{entries.length === 0 ? t('glossary.empty') : t('glossary.noResults')}</p>
                </div>
              ) : (
                filteredEntries.map((entry) => {
                  const firstImage = entry.imageUrls?.[0] || entry.imageUrl;
                  return (
                    <div
                      key={entry.id}
                      class="glossary-card glossary-viewer-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => setDetailEntry(entry)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setDetailEntry(entry);
                        }
                      }}
                    >
                      <div class="glossary-card-header">
                        {firstImage ? (
                          <img
                            src={firstImage}
                            alt={entry.translated}
                            class="glossary-card-image"
                          />
                        ) : (
                          <div class="glossary-card-placeholder">
                            <Icon name={typeIcons[entry.type]} />
                          </div>
                        )}
                        <div class="glossary-card-header-content">
                          <div class="glossary-card-names">
                            <span class="glossary-card-original" title={entry.original}>
                              {entry.original}
                            </span>
                            <span class="glossary-card-arrow">→</span>
                            <span class="glossary-card-translated" title={entry.translated}>
                              {entry.translated}
                            </span>
                          </div>
                          <div class="glossary-card-header-badges">
                            <div class="glossary-card-type-badge" title={typeLabels[entry.type]}>
                              <Icon name={typeIcons[entry.type]} size="sm" />
                            </div>
                            {entry.firstAppearance != null && (
                              <span
                                class="glossary-card-badge glossary-card-chapter"
                                title={t('glossary.firstMention')}
                              >
                                <Icon name="menu_book" size="sm" /> {entry.firstAppearance}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {entry.description && (
                        <div class="glossary-card-description" title={entry.description}>
                          {entry.description}
                        </div>
                      )}
                      {renderChapterPills(entry.mentionedInChapters)}
                      {entry.notes && (
                        <div class="glossary-card-notes" title={entry.notes}>
                          {entry.notes}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </Modal>

      {/* Read-only detail modal */}
      {detailEntry && (
        <Modal
          isOpen={true}
          onClose={() => setDetailEntry(null)}
          title={`${detailEntry.original} → ${detailEntry.translated}`}
          className="nested publication-glossary-detail-modal"
          footer={
            <Button variant="secondary" onClick={() => setDetailEntry(null)}>
              {t('common.close')}
            </Button>
          }
        >
          <div class="publication-glossary-detail">
            <div class="form-group">
              <span class="form-label">
                <Icon name={typeIcons[detailEntry.type]} size="sm" /> {typeLabels[detailEntry.type]}
              </span>
            </div>
            <div class="form-group">
              <label class="form-label">{t('glossary.originalLabel')}</label>
              <p style={{ margin: 0, color: 'var(--text-primary)' }}>{detailEntry.original}</p>
            </div>
            <div class="form-group">
              <label class="form-label">{t('glossary.translatedLabel')}</label>
              <p style={{ margin: 0, color: 'var(--text-primary)' }}>{detailEntry.translated}</p>
            </div>
            {detailEntry.description && (
              <div class="form-group">
                <label class="form-label">{t('glossary.description')}</label>
                <p style={{ margin: 0, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                  {detailEntry.description}
                </p>
              </div>
            )}
            {detailEntry.firstAppearance != null && (
              <div class="form-group">
                <label class="form-label">{t('glossary.firstMention')}</label>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                  {t('glossary.firstMentionChapter', { n: detailEntry.firstAppearance })}
                </p>
              </div>
            )}
            {detailEntry.mentionedInChapters && detailEntry.mentionedInChapters.length > 0 && (
              <div class="form-group">
                <label class="form-label">{t('glossary.chaptersMentionedLabel')}</label>
                <div class="edit-modal-chapters-block">
                  {renderChapterPills(detailEntry.mentionedInChapters)}
                </div>
              </div>
            )}
            {detailEntry.notes && (
              <div class="form-group">
                <label class="form-label">{t('glossary.notesLabel')}</label>
                <p style={{ margin: 0, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                  {detailEntry.notes}
                </p>
              </div>
            )}
            {(detailEntry.imageUrls?.length || detailEntry.imageUrl) && (
              <div class="form-group">
                <label class="form-label">{t('glossary.imageGallery')}</label>
                <div class="image-gallery-section">
                  <div class="image-gallery-grid">
                    {(
                      detailEntry.imageUrls || (detailEntry.imageUrl ? [detailEntry.imageUrl] : [])
                    ).map((imageUrl, index) => (
                      <div key={index} class="image-gallery-item publication-glossary-detail-image">
                        <button
                          type="button"
                          class="gallery-image-button"
                          style={{
                            cursor: 'pointer',
                            padding: 0,
                            border: 'none',
                            background: 'none',
                          }}
                          onClick={() => {
                            const viewer = document.createElement('div');
                            viewer.className = 'image-viewer-modal active';
                            viewer.innerHTML = `
                              <img src="${imageUrl}" alt="${detailEntry.translated}" />
                              <div class="image-viewer-title">${detailEntry.translated} (${index + 1} / ${(detailEntry.imageUrls || []).length})</div>
                            `;
                            viewer.onclick = () => document.body.removeChild(viewer);
                            document.body.appendChild(viewer);
                          }}
                        >
                          <img
                            src={imageUrl}
                            alt={`${detailEntry.translated} ${index + 1}`}
                            class="gallery-image-preview"
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Go to chapter confirmation modal */}
      <Modal
        isOpen={pendingChapter !== null}
        onClose={() => setPendingChapter(null)}
        title={t('glossary.goToChapterTitle')}
        className="nested publication-glossary-detail-modal publication-glossary-confirm-modal"
        footer={
          pendingChapter && (
            <>
              <Button variant="secondary" onClick={() => setPendingChapter(null)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={confirmGoToChapter}>{t('glossary.goToChapterButton')}</Button>
            </>
          )
        }
      >
        {pendingChapter && (
          <p class="publication-glossary-confirm-text">
            {t('glossary.goToChapterConfirm', {
              num: pendingChapter.number,
              title: pendingChapter.title,
            })}
          </p>
        )}
      </Modal>
    </>
  );
}
