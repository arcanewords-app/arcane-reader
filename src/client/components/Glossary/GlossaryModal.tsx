import { useState, useMemo, useEffect } from 'preact/hooks';
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

const typeLabels: Record<GlossaryEntryType, string> = {
  character: 'Персонажи',
  location: 'Локации',
  term: 'Термины',
};

export function GlossaryModal({
  isOpen,
  onClose,
  projectId,
  entries,
  onUpdate,
}: GlossaryModalProps) {
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
        title="📝 Глоссарий"
        size="large"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Закрыть
            </Button>
            <Button onClick={() => setShowAddModal(true)}>＋ Добавить запись</Button>
          </>
        }
      >
        <div class="glossary-toolbar">
          <div class="glossary-search">
            <input
              type="text"
              class="form-input"
              placeholder="🔍 Поиск..."
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
                {f === 'all' ? 'Все' : `${typeIcons[f]} ${typeLabels[f]}`}
                <span>{counts[f]}</span>
              </button>
            ))}
          </div>
        </div>

        <div class="glossary-grid">
          {filteredEntries.length === 0 ? (
            <div class="glossary-empty">
              <div class="glossary-empty-icon">📚</div>
              <p>{entries.length === 0 ? 'Глоссарий пуст' : 'Нет результатов'}</p>
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
                          <span class="glossary-card-badge glossary-card-chapter" title="Первое упоминание">
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
                    title="Удалить запись"
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
        title="🗑️ Удалить запись?"
        className="nested"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteConfirmEntry(null)}>
              Отмена
            </Button>
            <Button onClick={handleDeleteConfirm} loading={deleting}>
              Удалить
            </Button>
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)' }}>
          Вы уверены, что хотите удалить запись{' '}
          <strong>"{deleteConfirmEntry?.original}"</strong>?
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="📝 Новая запись глоссария"
      className="nested"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSave} loading={saving}>
            Добавить
          </Button>
        </>
      }
    >
      <Select
        label="Тип"
        value={type}
        onChange={(e) => setType((e.target as HTMLSelectElement).value as GlossaryEntryType)}
        options={[
          { value: 'character', label: '👤 Персонаж' },
          { value: 'location', label: '📍 Локация' },
          { value: 'term', label: '📖 Термин' },
        ]}
      />
      <Input
        label="Оригинал (EN)"
        placeholder="Например: The Dark Lord"
        value={original}
        onInput={(e) => setOriginal((e.target as HTMLInputElement).value)}
      />
      <Input
        label="Перевод (RU)"
        placeholder="Например: Тёмный Властелин"
        value={translated}
        onInput={(e) => setTranslated((e.target as HTMLInputElement).value)}
      />
      <div class="form-group">
        <label class="form-label">📝 Описание (опционально)</label>
        <textarea
          class="form-input"
          style={{ 
            minHeight: '80px', 
            resize: 'vertical',
            fontFamily: 'var(--font-display)'
          }}
          placeholder={
            type === 'character' 
              ? 'Например: Главный герой, молодой маг-исследователь'
              : type === 'location'
              ? 'Например: Столица королевства, крупный торговый город'
              : 'Например: Магическая энергия, используемая для заклинаний'
          }
          value={description}
          onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
        />
      </div>
      <Input
        label="Заметки (опционально)"
        placeholder="Дополнительный контекст..."
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="✏️ Редактировать запись"
      className="nested"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => onDelete(entry)}
            style={{ marginRight: 'auto' }}
          >
            🗑️ Удалить
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSave} loading={saving}>
            💾 Сохранить
          </Button>
        </>
      }
    >
      <Select
        label="Тип"
        value={type}
        onChange={(e) => setType((e.target as HTMLSelectElement).value as GlossaryEntryType)}
        options={[
          { value: 'character', label: '👤 Персонаж' },
          { value: 'location', label: '📍 Локация' },
          { value: 'term', label: '📖 Термин' },
        ]}
      />
      {type === 'character' && (
        <Select
          label="Пол (для склонения)"
          value={gender}
          onChange={(e) => setGender((e.target as HTMLSelectElement).value as typeof gender)}
          options={[
            { value: 'male', label: 'Мужской' },
            { value: 'female', label: 'Женский' },
            { value: 'neutral', label: 'Средний' },
            { value: 'unknown', label: 'Неизвестно' },
          ]}
        />
      )}
      <Input
        label="Оригинал (EN)"
        value={original}
        onInput={(e) => setOriginal((e.target as HTMLInputElement).value)}
      />
      <Input
        label="Перевод (RU)"
        value={translated}
        onInput={(e) => setTranslated((e.target as HTMLInputElement).value)}
      />
      <div class="form-group">
        <label class="form-label">📝 Описание</label>
        <textarea
          class="form-input"
          style={{ 
            minHeight: '80px', 
            resize: 'vertical',
            fontFamily: 'var(--font-display)'
          }}
          placeholder={
            type === 'character' 
              ? 'Например: Главный герой, молодой маг-исследователь, склонный к анализу'
              : type === 'location'
              ? 'Например: Столица королевства, крупный торговый город'
              : 'Например: Магическая энергия, используемая для заклинаний'
          }
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
            ? 'Описание автоматически извлечено при анализе. Вы можете его отредактировать.'
            : 'Краткое описание персонажа, локации или термина для лучшего контекста перевода'}
        </div>
      </div>
      <Input
        label="Заметки (опционально)"
        value={notes}
        onInput={(e) => setNotes((e.target as HTMLInputElement).value)}
        placeholder="Дополнительные пользовательские заметки..."
      />
      
      {/* First Appearance Info */}
      {entry.firstAppearance && (
        <div class="form-group">
          <label class="form-label">📖 Первое упоминание</label>
          <div style={{ 
            padding: '0.75rem', 
            background: 'var(--bg-secondary)', 
            borderRadius: '8px',
            color: 'var(--text-secondary)',
            fontSize: '0.9rem'
          }}>
            Глава {entry.firstAppearance}
            {entry.autoDetected && (
              <span style={{ marginLeft: '0.5rem', opacity: 0.7, fontSize: '0.85rem' }}>
                (автоопределено)
              </span>
            )}
          </div>
        </div>
      )}
      
      {/* Image Gallery Section */}
      <div class="form-group">
        <label class="form-label">🖼️ Галерея изображений</label>
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
                    title="Удалить изображение"
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
            {uploadingImage ? '⏳ Загрузка...' : '📤 Добавить изображение'}
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

