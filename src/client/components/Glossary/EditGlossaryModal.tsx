import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { GlossaryEntry, GlossaryEntryType } from '../../types.js';
import { Modal, Button, Input, Select, Icon, ConfirmModal } from '../ui/index.js';
import { api } from '../../api/client.js';
import { RelationshipsModal } from './RelationshipsModal.js';
import type { ChapterRef } from './glossaryTypes.js';

export interface EditGlossaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  entry: GlossaryEntry;
  entries: GlossaryEntry[];
  chapters?: ChapterRef[];
  typeLabels: Record<GlossaryEntryType, string>;
  /** Opens confirmation modal; parent handles actual navigation on confirm */
  onRequestNavigateToChapter?: (
    chapterId: string,
    num: number,
    title: string,
    searchTerm?: string
  ) => void;
  onNavigateToChapter?: (chapterId: string, searchTerm?: string) => void;
  onUpdate: () => void;
  onDelete: (entry: GlossaryEntry) => void;
}

export function EditGlossaryModal({
  isOpen,
  onClose,
  projectId,
  entry,
  entries,
  chapters,
  typeLabels,
  onRequestNavigateToChapter,
  onNavigateToChapter,
  onUpdate,
  onDelete,
}: EditGlossaryModalProps) {
  const { t } = useTranslation();

  const [goToChapterConfirm, setGoToChapterConfirm] = useState<{
    chapterId: string;
    num: number;
    title: string;
    searchTerm?: string;
  } | null>(null);

  const handleChapterClick = (num: number) => {
    if (!chapters?.length) return;
    const ch = chapters.find((c) => c.number === num);
    if (!ch) return;
    const title = ch.title ? ch.title : String(num);
    const searchTerm = entry.translated?.trim() || entry.original?.trim() || undefined;
    if (onRequestNavigateToChapter) {
      onRequestNavigateToChapter(ch.id, num, title, searchTerm);
    } else if (onNavigateToChapter) {
      setGoToChapterConfirm({ chapterId: ch.id, num, title, searchTerm });
    }
  };

  const handleConfirmGoToChapter = () => {
    if (!goToChapterConfirm || !onNavigateToChapter) return;
    onNavigateToChapter(goToChapterConfirm.chapterId, goToChapterConfirm.searchTerm);
    setGoToChapterConfirm(null);
  };

  const [type, setType] = useState(entry.type);
  const [original, setOriginal] = useState(entry.original);
  const [translated, setTranslated] = useState(entry.translated);
  const [description, setDescription] = useState(entry.description || '');
  const [notes, setNotes] = useState(entry.notes || '');
  const [gender, setGender] = useState(entry.gender || 'unknown');
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [deletingImageIndex, setDeletingImageIndex] = useState<number | null>(null);
  const [currentImageUrls, setCurrentImageUrls] = useState<string[]>(() => {
    if (entry.imageUrls && entry.imageUrls.length > 0) {
      return entry.imageUrls;
    }
    if (entry.imageUrl) {
      return [entry.imageUrl];
    }
    return [];
  });
  const [relatedEntryIds, setRelatedEntryIds] = useState<string[]>(entry.relatedEntryIds ?? []);
  const [primaryLocationId, setPrimaryLocationId] = useState<string>(entry.primaryLocationId ?? '');
  const [showRelationshipsModal, setShowRelationshipsModal] = useState(false);

  useEffect(() => {
    setType(entry.type);
    setOriginal(entry.original);
    setTranslated(entry.translated);
    setDescription(entry.description || '');
    setNotes(entry.notes || '');
    setGender(entry.gender || 'unknown');
    setRelatedEntryIds(entry.relatedEntryIds ?? []);
    setPrimaryLocationId(entry.primaryLocationId ?? '');
    if (entry.imageUrls && entry.imageUrls.length > 0) {
      setCurrentImageUrls(entry.imageUrls);
    } else if (entry.imageUrl) {
      setCurrentImageUrls([entry.imageUrl]);
    } else {
      setCurrentImageUrls([]);
    }
  }, [entry]);

  const handleImageUpload = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const result = await api.uploadGlossaryImage(projectId, entry.id, file);
      setCurrentImageUrls(result.imageUrls || []);
      onUpdate();
    } catch (error) {
      console.error('Failed to upload image:', error);
    } finally {
      setUploadingImage(false);
      (e.target as HTMLInputElement).value = '';
    }
  };

  const handleImageDelete = async (imageIndex: number) => {
    if (imageIndex < 0 || imageIndex >= currentImageUrls.length) return;

    setDeletingImageIndex(imageIndex);
    try {
      const result = await api.deleteGlossaryImage(projectId, entry.id, imageIndex);
      setCurrentImageUrls(result.imageUrls || []);
      onUpdate();
    } catch (error) {
      console.error('Failed to delete image:', error);
    } finally {
      setDeletingImageIndex(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateGlossaryEntry(projectId, entry.id, {
        type,
        original: original.trim(),
        translated: translated.trim(),
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
        gender: type === 'character' ? gender : undefined,
        relatedEntryIds,
        primaryLocationId: type === 'character' ? primaryLocationId || undefined : undefined,
      });
      onClose();
      onUpdate();
    } finally {
      setSaving(false);
    }
  };

  const otherEntries = entries.filter((e) => e.id !== entry.id);
  const locationEntries = otherEntries.filter((e) => e.type === 'location');

  const descriptionPlaceholderEdit =
    type === 'character'
      ? t('glossary.descriptionPlaceholderCharEdit')
      : type === 'location'
        ? t('glossary.descriptionPlaceholderLoc')
        : t('glossary.descriptionPlaceholderTerm');

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={t('glossary.editEntryTitle')}
        className="nested"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => onDelete(entry)}
              style={{ marginRight: 'auto' }}
            >
              {t('common.delete')}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave} loading={saving}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <Select
          label={t('glossary.typeLabel')}
          value={type}
          onChange={(e) => setType((e.target as HTMLSelectElement).value as GlossaryEntryType)}
          options={[
            { value: 'character', label: t('glossary.characters') },
            { value: 'location', label: t('glossary.locations') },
            { value: 'term', label: t('glossary.terms') },
          ]}
        />
        {type === 'character' && (
          <Select
            label={t('glossary.genderLabel')}
            value={gender}
            onChange={(e) => setGender((e.target as HTMLSelectElement).value as typeof gender)}
            options={[
              { value: 'male', label: t('glossary.genderMale') },
              { value: 'female', label: t('glossary.genderFemale') },
              { value: 'neutral', label: t('glossary.genderNeutral') },
              { value: 'unknown', label: t('glossary.genderUnknown') },
            ]}
          />
        )}
        <Input
          label={t('glossary.originalLabel')}
          value={original}
          onInput={(e) => setOriginal((e.target as HTMLInputElement).value)}
        />
        <Input
          label={t('glossary.translatedLabel')}
          value={translated}
          onInput={(e) => setTranslated((e.target as HTMLInputElement).value)}
        />
        <div class="form-group">
          <label class="form-label">{t('glossary.description')}</label>
          <textarea
            class="form-input"
            style={{
              minHeight: '80px',
              resize: 'vertical',
              fontFamily: 'var(--font-display)',
            }}
            placeholder={descriptionPlaceholderEdit}
            value={description}
            onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
          />
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-dim)',
              marginTop: '0.25rem',
              fontStyle: 'italic',
            }}
          >
            {entry.autoDetected && description
              ? t('glossary.descriptionAutoExtracted')
              : t('glossary.descriptionHint')}
          </div>
        </div>
        <Input
          label={t('glossary.notesLabel')}
          value={notes}
          onInput={(e) => setNotes((e.target as HTMLInputElement).value)}
          placeholder={t('glossary.notesPlaceholderEdit')}
        />

        {entry.firstAppearance && (
          <div class="form-group">
            <label class="form-label">{t('glossary.firstMention')}</label>
            <div
              style={{
                padding: '0.75rem',
                background: 'var(--bg-secondary)',
                borderRadius: '8px',
                color: 'var(--text-secondary)',
                fontSize: '0.9rem',
              }}
            >
              {t('glossary.firstMentionChapter', { n: entry.firstAppearance })}
              {entry.autoDetected && (
                <span style={{ marginLeft: '0.5rem', opacity: 0.7, fontSize: '0.85rem' }}>
                  {t('glossary.autoDetected')}
                </span>
              )}
            </div>
          </div>
        )}

        {entry.mentionedInChapters && entry.mentionedInChapters.length > 0 && (
          <div class="form-group">
            <label class="form-label">{t('glossary.chaptersMentionedLabel')}</label>
            <div class="edit-modal-chapters-block">
              {chapters?.length && (onRequestNavigateToChapter || onNavigateToChapter)
                ? entry.mentionedInChapters.map((num) => {
                    const ch = chapters.find((c) => c.number === num);
                    const isClickable = !!ch?.id;
                    return isClickable ? (
                      <button
                        key={num}
                        type="button"
                        class="glossary-chapter-pill"
                        title={ch?.title ? `${num}: ${ch.title}` : String(num)}
                        onClick={() => handleChapterClick(num)}
                      >
                        {ch?.title ? `${num}. ${ch.title}` : num}
                      </button>
                    ) : (
                      <span key={num} class="glossary-chapter-pill glossary-chapter-pill-static">
                        {num}
                      </span>
                    );
                  })
                : entry.mentionedInChapters.join(', ')}
            </div>
          </div>
        )}

        <div class="form-group">
          <label class="form-label">{t('glossary.relationshipsLabel')}</label>
          <p class="form-hint" style={{ marginBottom: '0.5rem' }}>
            {t('glossary.relationshipsHint')}
          </p>
          {otherEntries.length > 0 ? (
            <div class="glossary-relationships-summary">
              <span class="glossary-relationships-summary-text">
                {relatedEntryIds.length > 0
                  ? t('glossary.relationshipsSelectedCount', { count: relatedEntryIds.length })
                  : t('glossary.relationshipsEmpty')}
              </span>
              <Button
                variant="secondary"
                onClick={() => setShowRelationshipsModal(true)}
                aria-label={t('glossary.relationshipsSelectButton')}
              >
                {t('glossary.relationshipsSelectButton')}
              </Button>
            </div>
          ) : (
            <span class="form-hint">{t('glossary.relationshipsEmpty')}</span>
          )}
        </div>

        {showRelationshipsModal && (
          <RelationshipsModal
            isOpen={showRelationshipsModal}
            onClose={() => setShowRelationshipsModal(false)}
            entries={otherEntries}
            selectedIds={relatedEntryIds}
            onApply={(ids) => {
              setRelatedEntryIds(ids);
              setShowRelationshipsModal(false);
            }}
            typeLabels={typeLabels}
            currentEntry={entry}
            chapters={chapters}
          />
        )}

        {type === 'character' && locationEntries.length > 0 && (
          <div class="form-group">
            <label class="form-label">{t('glossary.primaryLocationLabel')}</label>
            <Select
              value={primaryLocationId}
              onChange={(e) => setPrimaryLocationId((e.target as HTMLSelectElement).value)}
              options={[
                { value: '', label: t('glossary.primaryLocationNone') },
                ...locationEntries.map((e) => ({
                  value: e.id,
                  label: `${e.original} → ${e.translated}`,
                })),
              ]}
            />
          </div>
        )}

        <div class="form-group">
          <label class="form-label">{t('glossary.imageGallery')}</label>
          <div class="image-gallery-section">
            {currentImageUrls.length > 0 && (
              <div class="image-gallery-grid">
                {currentImageUrls.map((imageUrl, index) => (
                  <div key={index} class="image-gallery-item">
                    <button
                      type="button"
                      class="gallery-image-button"
                      style={{ cursor: 'pointer', padding: 0, border: 'none', background: 'none' }}
                      onClick={() => {
                        const viewer = document.createElement('div');
                        viewer.className = 'image-viewer-modal active';
                        viewer.innerHTML = `
                        <img src="${imageUrl}" alt="${translated}" />
                        <div class="image-viewer-title">${translated} (${index + 1} / ${currentImageUrls.length})</div>
                      `;
                        viewer.onclick = () => {
                          document.body.removeChild(viewer);
                        };
                        document.body.appendChild(viewer);
                      }}
                    >
                      <img
                        src={imageUrl}
                        alt={`${translated} - изображение ${index + 1}`}
                        class="gallery-image-preview"
                      />
                    </button>
                    <button
                      class="gallery-image-delete"
                      onClick={() => handleImageDelete(index)}
                      disabled={deletingImageIndex === index}
                      title={t('glossary.deleteImageTitle')}
                    >
                      {deletingImageIndex === index ? (
                        <Icon name="schedule" size="sm" />
                      ) : (
                        <Icon name="delete" size="sm" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label
              class="image-upload-btn"
              style={{
                cursor: uploadingImage ? 'wait' : 'pointer',
                opacity: uploadingImage ? 0.6 : 1,
                marginTop: currentImageUrls.length > 0 ? '0.75rem' : '0',
              }}
            >
              {uploadingImage
                ? `... ${t('glossary.uploadImageLoading')}`
                : t('glossary.addImageButton')}
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleImageUpload}
                disabled={uploadingImage}
              />
            </label>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!goToChapterConfirm}
        onClose={() => setGoToChapterConfirm(null)}
        onConfirm={handleConfirmGoToChapter}
        title={
          goToChapterConfirm
            ? t('glossary.goToChapterConfirm', {
                num: goToChapterConfirm.num,
                title: goToChapterConfirm.title,
              })
            : ''
        }
        message={
          goToChapterConfirm
            ? t('glossary.goToChapterConfirm', {
                num: goToChapterConfirm.num,
                title: goToChapterConfirm.title,
              })
            : ''
        }
        confirmLabel={t('glossary.goToChapterButton')}
      />
    </>
  );
}
