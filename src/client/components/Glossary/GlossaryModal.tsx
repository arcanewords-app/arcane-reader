import { useState, useMemo } from 'preact/hooks';
import type { GlossaryEntry, GlossaryEntryType } from '../../types';
import { Modal, Button, Input, Select } from '../ui';
import { api } from '../../api/client';

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
            filteredEntries.map((entry) => (
              <div
                key={entry.id}
                class="glossary-card"
                onClick={() => setEditingEntry(entry)}
              >
                {entry.imageUrl ? (
                  <img
                    src={entry.imageUrl}
                    alt={entry.translated}
                    class="glossary-card-image"
                  />
                ) : (
                  <div class="glossary-card-placeholder">
                    {typeIcons[entry.type]}
                  </div>
                )}
                <div class="glossary-card-content">
                  <div class="glossary-card-names">
                    <span class="glossary-card-original">{entry.original}</span>
                    <span class="glossary-card-arrow">→</span>
                    <span class="glossary-card-translated">{entry.translated}</span>
                  </div>
                  <div class="glossary-card-meta">
                    <span class="glossary-card-type">
                      {typeIcons[entry.type]} {entry.type}
                    </span>
                    {entry.notes && (
                      <span class="glossary-card-notes">{entry.notes}</span>
                    )}
                  </div>
                </div>
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
            ))
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
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setType('character');
    setOriginal('');
    setTranslated('');
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
  const [notes, setNotes] = useState(entry.notes || '');
  const [gender, setGender] = useState(entry.gender || 'unknown');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateGlossaryEntry(projectId, entry.id, {
        type,
        original: original.trim(),
        translated: translated.trim(),
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
      <Input
        label="Заметки"
        value={notes}
        onInput={(e) => setNotes((e.target as HTMLInputElement).value)}
      />
    </Modal>
  );
}

