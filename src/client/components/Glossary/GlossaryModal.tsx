import { useState, useMemo, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { GlossaryEntry, GlossaryEntryType } from '../../types';
import { Modal, Button, Input, Select } from '../ui';
import { api } from '../../api/client';
import './GlossaryModal.css';

type FilterType = 'all' | GlossaryEntryType;

interface GlossaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  entries: GlossaryEntry[];
  onUpdate: () => void;
}

const typeIcons: Record<GlossaryEntryType, string> = {
  character: '👤',
  location: '📍',
  term: '📖',
};

export function GlossaryModal({
  isOpen,
  onClose,
  projectId,
  entries,
  onUpdate,
}: GlossaryModalProps) {
  const { t } = useTranslation();
  const typeLabels: Record<GlossaryEntryType, string> = {
    character: t('glossary.characters'),
    location: t('glossary.locations'),
    term: t('glossary.terms'),
  };
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<GlossaryEntry | null>(null);
  const [deleteConfirmEntry, setDeleteConfirmEntry] = useState<GlossaryEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const counts = useMemo(() => ({
    all: entries.length,
    character: entries.filter((e) => e.type === 'character').length,
    location: entries.filter((e) => e.type === 'location').length,
    term: entries.filter((e) => e.type === 'term').length,
  }), [entries]);

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmEntry) return;
    setDeleting(true);
    try {
      await api.deleteGlossaryEntry(projectId, deleteConfirmEntry.id);
      setDeleteConfirmEntry(null);
      onUpdate();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`📝 ${t('glossary.title')}`}
        size="large"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              {t('common.close')}
            </Button>
            <Button onClick={() => setShowAddModal(true)}>＋ {t('glossary.addEntry')}</Button>
          </>
        }
      >
        <div class="glossary-toolbar">
          <div class="glossary-search">
            <input
              type="text"
              class="form-input"
              placeholder={`🔍 ${t('glossary.searchPlaceholder')}`}
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
                {f === 'all' ? t('glossary.all') : `${typeIcons[f]} ${typeLabels[f]}`}
                <span>{counts[f]}</span>
              </button>
            ))}
          </div>
        </div>

        <div class="glossary-grid">
          {filteredEntries.length === 0 ? (
            <div class="glossary-empty">
              <div class="glossary-empty-icon">📚</div>
              <p>{entries.length === 0 ? t('glossary.empty') : t('glossary.noResults')}</p>
            </div>
          ) : (
            filteredEntries.map((entry) => {
              // Get first image from gallery (support legacy imageUrl)
              const firstImage = entry.imageUrls?.[0] || entry.imageUrl;
              
              return (
                <div
                  key={entry.id}
                  class="glossary-card"
                  onClick={() => setEditingEntry(entry)}
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
                        {typeIcons[entry.type]}
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
                          {typeIcons[entry.type]}
                        </div>
                        {entry.firstAppearance && (
                          <span class="glossary-card-badge glossary-card-chapter" title={t('glossary.firstMention')}>
                            📖 {entry.firstAppearance}
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
                  
                  {entry.notes && (
                    <div class="glossary-card-notes" title={entry.notes}>
                      {entry.notes}
                    </div>
                  )}
                  
                  <button
                    class="glossary-card-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmEntry(entry);
                    }}
                    title={t('glossary.deleteEntryTitle')}
                  >
                    🗑️
                  </button>
                </div>
              );
            })
          )}
        </div>
      </Modal>

      {/* Add Entry Modal */}
      <AddGlossaryModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        projectId={projectId}
        onAdd={onUpdate}
      />

      {/* Edit Entry Modal */}
      {editingEntry && (
        <EditGlossaryModal
          isOpen={true}
          onClose={() => setEditingEntry(null)}
          projectId={projectId}
          entry={editingEntry}
          onUpdate={() => {
            setEditingEntry(null);
            onUpdate();
          }}
          onDelete={(entry) => {
            setEditingEntry(null);
            setDeleteConfirmEntry(entry);
          }}
        />
      )}

      {/* Delete Confirm Modal */}
      <Modal
        isOpen={deleteConfirmEntry !== null}
        onClose={() => setDeleteConfirmEntry(null)}
        title={`🗑️ ${t('glossary.deleteEntryConfirmTitle')}`}
        className="nested"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteConfirmEntry(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleDeleteConfirm} loading={deleting}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)' }}>
          {t('glossary.deleteEntryConfirmMessage', { original: deleteConfirmEntry?.original ?? '' })}
        </p>
      </Modal>
    </>
  );
}

// === Add Modal ===

interface AddGlossaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onAdd: () => void;
}

function AddGlossaryModal({ isOpen, onClose, projectId, onAdd }: AddGlossaryModalProps) {
  const { t } = useTranslation();
  const [type, setType] = useState<GlossaryEntryType>('character');
  const [original, setOriginal] = useState('');
  const [translated, setTranslated] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setType('character');
    setOriginal('');
    setTranslated('');
    setDescription('');
    setNotes('');
  };

  const handleSave = async () => {
    if (!original.trim()) return;
    setSaving(true);
    try {
      await api.addGlossary(projectId, {
        type,
        original: original.trim(),
        translated: translated.trim(),
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      reset();
      onClose();
      onAdd();
    } finally {
      setSaving(false);
    }
  };

  const descriptionPlaceholder = type === 'character'
    ? t('glossary.descriptionPlaceholderChar')
    : type === 'location'
    ? t('glossary.descriptionPlaceholderLoc')
    : t('glossary.descriptionPlaceholderTerm');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`📝 ${t('glossary.newEntryTitle')}`}
      className="nested"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {t('glossary.addButton')}
          </Button>
        </>
      }
    >
      <Select
        label={t('glossary.typeLabel')}
        value={type}
        onChange={(e) => setType((e.target as HTMLSelectElement).value as GlossaryEntryType)}
        options={[
          { value: 'character', label: `👤 ${t('glossary.characters')}` },
          { value: 'location', label: `📍 ${t('glossary.locations')}` },
          { value: 'term', label: `📖 ${t('glossary.terms')}` },
        ]}
      />
      <Input
        label={t('glossary.originalLabel')}
        placeholder={t('glossary.originalPlaceholder')}
        value={original}
        onInput={(e) => setOriginal((e.target as HTMLInputElement).value)}
      />
      <Input
        label={t('glossary.translatedLabel')}
        placeholder={t('glossary.translatedPlaceholder')}
        value={translated}
        onInput={(e) => setTranslated((e.target as HTMLInputElement).value)}
      />
      <div class="form-group">
        <label class="form-label">📝 {t('glossary.descriptionOptionalLabel')}</label>
        <textarea
          class="form-input"
          style={{ 
            minHeight: '80px', 
            resize: 'vertical',
            fontFamily: 'var(--font-display)'
          }}
          placeholder={descriptionPlaceholder}
          value={description}
          onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
        />
      </div>
      <Input
        label={t('glossary.notesLabel')}
        placeholder={t('glossary.notesPlaceholder')}
        value={notes}
        onInput={(e) => setNotes((e.target as HTMLInputElement).value)}
      />
    </Modal>
  );
}

// === Edit Modal ===

interface EditGlossaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  entry: GlossaryEntry;
  onUpdate: () => void;
  onDelete: (entry: GlossaryEntry) => void;
}

function EditGlossaryModal({
  isOpen,
  onClose,
  projectId,
  entry,
  onUpdate,
  onDelete,
}: EditGlossaryModalProps) {
  const { t } = useTranslation();
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
    // Migrate from legacy imageUrl if needed
    if (entry.imageUrls && entry.imageUrls.length > 0) {
      return entry.imageUrls;
    }
    if (entry.imageUrl) {
      return [entry.imageUrl];
    }
    return [];
  });

  // Update all fields when entry changes
  useEffect(() => {
    setType(entry.type);
    setOriginal(entry.original);
    setTranslated(entry.translated);
    setDescription(entry.description || '');
    setNotes(entry.notes || '');
    setGender(entry.gender || 'unknown');
    // Update image gallery (migrate from legacy if needed)
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
      // Reset file input
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
      });
      onClose();
      onUpdate();
    } finally {
      setSaving(false);
    }
  };

  const descriptionPlaceholderEdit = type === 'character'
    ? t('glossary.descriptionPlaceholderCharEdit')
    : type === 'location'
    ? t('glossary.descriptionPlaceholderLoc')
    : t('glossary.descriptionPlaceholderTerm');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`✏️ ${t('glossary.editEntryTitle')}`}
      className="nested"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => onDelete(entry)}
            style={{ marginRight: 'auto' }}
          >
            🗑️ {t('common.delete')}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} loading={saving}>
            💾 {t('common.save')}
          </Button>
        </>
      }
    >
      <Select
        label={t('glossary.typeLabel')}
        value={type}
        onChange={(e) => setType((e.target as HTMLSelectElement).value as GlossaryEntryType)}
        options={[
          { value: 'character', label: `👤 ${t('glossary.characters')}` },
          { value: 'location', label: `📍 ${t('glossary.locations')}` },
          { value: 'term', label: `📖 ${t('glossary.terms')}` },
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
        <label class="form-label">📝 {t('glossary.description')}</label>
        <textarea
          class="form-input"
          style={{ 
            minHeight: '80px', 
            resize: 'vertical',
            fontFamily: 'var(--font-display)'
          }}
          placeholder={descriptionPlaceholderEdit}
          value={description}
          onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
        />
        <div style={{ 
          fontSize: '0.75rem', 
          color: 'var(--text-dim)', 
          marginTop: '0.25rem',
          fontStyle: 'italic'
        }}>
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
      
      {/* First Appearance Info */}
      {entry.firstAppearance && (
        <div class="form-group">
          <label class="form-label">📖 {t('glossary.firstMention')}</label>
          <div style={{ 
            padding: '0.75rem', 
            background: 'var(--bg-secondary)', 
            borderRadius: '8px',
            color: 'var(--text-secondary)',
            fontSize: '0.9rem'
          }}>
            {t('glossary.firstMentionChapter', { n: entry.firstAppearance })}
            {entry.autoDetected && (
              <span style={{ marginLeft: '0.5rem', opacity: 0.7, fontSize: '0.85rem' }}>
                {t('glossary.autoDetected')}
              </span>
            )}
          </div>
        </div>
      )}
      
      {/* Image Gallery Section */}
      <div class="form-group">
        <label class="form-label">🖼️ {t('glossary.imageGallery')}</label>
        <div class="image-gallery-section">
          {currentImageUrls.length > 0 && (
            <div class="image-gallery-grid">
              {currentImageUrls.map((imageUrl, index) => (
                <div key={index} class="image-gallery-item">
                  <img
                    src={imageUrl}
                    alt={`${translated} - изображение ${index + 1}`}
                    class="gallery-image-preview"
                    onClick={() => {
                      // Open image in fullscreen viewer
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
                    style={{ cursor: 'pointer' }}
                  />
                  <button
                    class="gallery-image-delete"
                    onClick={() => handleImageDelete(index)}
                    disabled={deletingImageIndex === index}
                    title={t('glossary.deleteImageTitle')}
                  >
                    {deletingImageIndex === index ? '⏳' : '🗑️'}
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
              marginTop: currentImageUrls.length > 0 ? '0.75rem' : '0'
            }}
          >
            {uploadingImage ? `⏳ ${t('glossary.uploadImageLoading')}` : `📤 ${t('glossary.addImageButton')}`}
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
  );
}

