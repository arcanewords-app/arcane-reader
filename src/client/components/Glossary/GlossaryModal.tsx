import { useState, useMemo, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { GlossaryEntry, GlossaryEntryType } from '../../types';
import { Modal, Button, Input, Select } from '../ui';
import { api } from '../../api/client';
import './GlossaryModal.css';

type FilterType = 'all' | GlossaryEntryType;

/** Optional: for showing chapter titles and "go to chapter" from mentioned-in-chapters */
export interface ChapterRef {
  id: string;
  number: number;
  title: string;
}

interface GlossaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  entries: GlossaryEntry[];
  onUpdate: () => void;
  /** Optional: list of chapters (number → id, title) for pills and navigation */
  chapters?: ChapterRef[];
  /** Optional: when user confirms, navigate to this chapter (modal will close from parent) */
  onNavigateToChapter?: (chapterId: string) => void;
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
  chapters,
  onNavigateToChapter,
}: GlossaryModalProps) {
  const { t } = useTranslation();

  const handleChapterClick = (num: number) => {
    if (!onNavigateToChapter || !chapters?.length) return;
    const ch = chapters.find((c) => c.number === num);
    if (!ch) return;
    const title = ch.title ? ch.title : String(num);
    if (!confirm(t('glossary.goToChapterConfirm', { num, title }))) return;
    onNavigateToChapter(ch.id);
  };
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

  type MergeSuggestionItem = { entryIds: string[]; reason: string; suggestedPrimaryId?: string };
  const [mergeSuggestions, setMergeSuggestions] = useState<MergeSuggestionItem[] | null>(null);
  const [loadingMergeSuggestions, setLoadingMergeSuggestions] = useState(false);
  const [showMergeSuggestionsModal, setShowMergeSuggestionsModal] = useState(false);
  const [selectedMergeIndexes, setSelectedMergeIndexes] = useState<Set<number>>(new Set());
  const [keepEntryIdByIndex, setKeepEntryIdByIndex] = useState<Record<number, string>>({});
  const [applyingMerges, setApplyingMerges] = useState(false);

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

  const handleSuggestMerges = async () => {
    if (entries.length < 2) return;
    setLoadingMergeSuggestions(true);
    setMergeSuggestions(null);
    try {
      const res = await api.suggestGlossaryMerges(projectId);
      const list = res.suggestions ?? [];
      setMergeSuggestions(list);
      const initialKeep: Record<number, string> = {};
      list.forEach((s, i) => {
        initialKeep[i] = s.suggestedPrimaryId ?? s.entryIds[0] ?? '';
      });
      setKeepEntryIdByIndex(initialKeep);
      setSelectedMergeIndexes(new Set());
      setShowMergeSuggestionsModal(true);
    } catch (err) {
      console.error('Suggest merges failed:', err);
    } finally {
      setLoadingMergeSuggestions(false);
    }
  };

  const toggleMergeSelection = (index: number) => {
    setSelectedMergeIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const setKeepForMerge = (index: number, entryId: string) => {
    setKeepEntryIdByIndex((prev) => ({ ...prev, [index]: entryId }));
  };

  const handleApplyMerges = async () => {
    if (!mergeSuggestions?.length || selectedMergeIndexes.size === 0) return;
    setApplyingMerges(true);
    const indexes = [...selectedMergeIndexes].sort((a, b) => a - b);
    try {
      for (const i of indexes) {
        const s = mergeSuggestions[i];
        if (!s?.entryIds?.length) continue;
        const keepId = keepEntryIdByIndex[i] ?? s.suggestedPrimaryId ?? s.entryIds[0];
        await api.mergeGlossaryEntries(projectId, {
          entryIds: s.entryIds,
          keepEntryId: keepId,
        });
      }
      onUpdate();
      setShowMergeSuggestionsModal(false);
      setMergeSuggestions(null);
      setSelectedMergeIndexes(new Set());
    } catch (err) {
      console.error('Apply merges failed:', err);
      alert(t('glossary.mergeError'));
    } finally {
      setApplyingMerges(false);
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
            <Button
              variant="secondary"
              onClick={handleSuggestMerges}
              disabled={entries.length < 2 || loadingMergeSuggestions}
              title={entries.length < 2 ? t('glossary.noSuggestions') : undefined}
            >
              {loadingMergeSuggestions
                ? t('glossary.suggestMergesLoading')
                : `🔀 ${t('glossary.suggestMerges')}`}
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
                <div key={entry.id} class="glossary-card" onClick={() => setEditingEntry(entry)}>
                  <div class="glossary-card-header">
                    {firstImage ? (
                      <img src={firstImage} alt={entry.translated} class="glossary-card-image" />
                    ) : (
                      <div class="glossary-card-placeholder">{typeIcons[entry.type]}</div>
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
                          <span
                            class="glossary-card-badge glossary-card-chapter"
                            title={t('glossary.firstMention')}
                          >
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

                  {entry.mentionedInChapters && entry.mentionedInChapters.length > 0 && (
                    <div
                      class="glossary-card-chapters"
                      title={t('glossary.chaptersMentionedLabel')}
                    >
                      {chapters?.length && onNavigateToChapter
                        ? entry.mentionedInChapters.map((num) => {
                            const ch = chapters.find((c) => c.number === num);
                            const title = ch ? `${num}: ${ch.title}` : String(num);
                            const isClickable = !!ch?.id;
                            return isClickable ? (
                              <button
                                key={num}
                                type="button"
                                class="glossary-chapter-pill"
                                title={t('glossary.goToChapterConfirm', {
                                  num,
                                  title: ch?.title ?? num,
                                })}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleChapterClick(num);
                                }}
                              >
                                {num}
                              </button>
                            ) : (
                              <span
                                key={num}
                                class="glossary-chapter-pill glossary-chapter-pill-static"
                              >
                                {num}
                              </span>
                            );
                          })
                        : t('glossary.mentionedInChapters', {
                            chapters: entry.mentionedInChapters.join(', '),
                          })}
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

      {/* Merge suggestions modal — use nested-modal so it appears above glossary overlay (z-index) */}
      <Modal
        isOpen={showMergeSuggestionsModal}
        onClose={() => {
          setShowMergeSuggestionsModal(false);
          setMergeSuggestions(null);
        }}
        title={t('glossary.suggestionsTitle', {
          count: mergeSuggestions?.length ?? 0,
        })}
        size="medium"
        className="nested-modal"
        footer={
          mergeSuggestions && mergeSuggestions.length > 0 ? (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowMergeSuggestionsModal(false);
                  setMergeSuggestions(null);
                }}
              >
                {t('common.close')}
              </Button>
              <Button
                onClick={handleApplyMerges}
                disabled={selectedMergeIndexes.size === 0 || applyingMerges}
              >
                {applyingMerges
                  ? t('glossary.suggestMergesLoading')
                  : t('glossary.applySelected', { count: selectedMergeIndexes.size })}
              </Button>
            </>
          ) : undefined
        }
      >
        {mergeSuggestions === null ? (
          <div class="glossary-merge-loading">{t('glossary.suggestMergesLoading')}</div>
        ) : mergeSuggestions.length === 0 ? (
          <p class="glossary-merge-empty">{t('glossary.noSuggestions')}</p>
        ) : (
          <div class="glossary-merge-list">
            {mergeSuggestions.map((suggestion, index) => {
              const suggestedEntries = suggestion.entryIds
                .map((id) => entries.find((x) => x.id === id))
                .filter(Boolean) as GlossaryEntry[];
              const keepId =
                keepEntryIdByIndex[index] ??
                suggestion.suggestedPrimaryId ??
                suggestion.entryIds[0];
              const keepEntry = entries.find((x) => x.id === keepId);
              return (
                <div key={index} class="glossary-merge-card">
                  <div class="glossary-merge-card-head">
                    <label class="glossary-merge-card-select">
                      <input
                        type="checkbox"
                        checked={selectedMergeIndexes.has(index)}
                        onChange={() => toggleMergeSelection(index)}
                      />
                      <span class="glossary-merge-card-title">
                        {t('glossary.mergeReason', { reason: suggestion.reason })}
                      </span>
                    </label>
                  </div>
                  <div class="glossary-merge-columns">
                    <div class="glossary-merge-col glossary-merge-col-sources">
                      <div class="glossary-merge-col-label">{t('glossary.entriesToMerge')}</div>
                      <div class="glossary-merge-entry-cards">
                        {suggestedEntries.map((entry) => (
                          <div
                            key={entry.id}
                            class={`glossary-merge-entry-card ${entry.id === keepId ? 'is-primary' : ''}`}
                            title={entry.description ?? undefined}
                          >
                            <div class="glossary-merge-entry-card-header">
                              <span
                                class="glossary-merge-entry-card-icon"
                                title={typeLabels[entry.type]}
                              >
                                {typeIcons[entry.type]}
                              </span>
                              <div class="glossary-merge-entry-card-names">
                                <span class="glossary-merge-entry-original">{entry.original}</span>
                                <span class="glossary-merge-entry-arrow">→</span>
                                <span class="glossary-merge-entry-translated">
                                  {entry.translated}
                                </span>
                              </div>
                            </div>
                            {entry.description && (
                              <p class="glossary-merge-entry-desc" title={entry.description}>
                                {entry.description.length > 60
                                  ? `${entry.description.slice(0, 60)}…`
                                  : entry.description}
                              </p>
                            )}
                            {entry.mentionedInChapters && entry.mentionedInChapters.length > 0 && (
                              <div class="glossary-merge-entry-chapters">
                                📖 {entry.mentionedInChapters.length} ch.
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div class="glossary-merge-col glossary-merge-col-result">
                      <div class="glossary-merge-col-label">{t('glossary.keepAsPrimary')}</div>
                      {keepEntry && (
                        <div class="glossary-merge-entry-card glossary-merge-entry-card-keep">
                          <div class="glossary-merge-entry-card-header">
                            <span
                              class="glossary-merge-entry-card-icon"
                              title={typeLabels[keepEntry.type]}
                            >
                              {typeIcons[keepEntry.type]}
                            </span>
                            <div class="glossary-merge-entry-card-names">
                              <span class="glossary-merge-entry-original">
                                {keepEntry.original}
                              </span>
                              <span class="glossary-merge-entry-arrow">→</span>
                              <span class="glossary-merge-entry-translated">
                                {keepEntry.translated}
                              </span>
                            </div>
                          </div>
                          {keepEntry.description && (
                            <p class="glossary-merge-entry-desc" title={keepEntry.description}>
                              {keepEntry.description.length > 60
                                ? `${keepEntry.description.slice(0, 60)}…`
                                : keepEntry.description}
                            </p>
                          )}
                          <select
                            class="glossary-merge-keep-select"
                            value={keepId}
                            onChange={(e) =>
                              setKeepForMerge(index, (e.target as HTMLSelectElement).value)
                            }
                            onClick={(e) => e.stopPropagation()}
                          >
                            {suggestion.entryIds.map((id) => {
                              const e = entries.find((x) => x.id === id);
                              const label = e ? `${e.original} → ${e.translated}` : id;
                              return (
                                <option key={id} value={id}>
                                  {label}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
          chapters={chapters}
          onNavigateToChapter={onNavigateToChapter}
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
          {t('glossary.deleteEntryConfirmMessage', {
            original: deleteConfirmEntry?.original ?? '',
          })}
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

  const descriptionPlaceholder =
    type === 'character'
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
            fontFamily: 'var(--font-display)',
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
  chapters?: ChapterRef[];
  onNavigateToChapter?: (chapterId: string) => void;
  onUpdate: () => void;
  onDelete: (entry: GlossaryEntry) => void;
}

function EditGlossaryModal({
  isOpen,
  onClose,
  projectId,
  entry,
  chapters,
  onNavigateToChapter,
  onUpdate,
  onDelete,
}: EditGlossaryModalProps) {
  const { t } = useTranslation();

  const handleChapterClick = (num: number) => {
    if (!onNavigateToChapter || !chapters?.length) return;
    const ch = chapters.find((c) => c.number === num);
    if (!ch) return;
    const title = ch.title ? ch.title : String(num);
    if (!confirm(t('glossary.goToChapterConfirm', { num, title }))) return;
    onNavigateToChapter(ch.id);
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

  const descriptionPlaceholderEdit =
    type === 'character'
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

      {/* First Appearance Info */}
      {entry.firstAppearance && (
        <div class="form-group">
          <label class="form-label">📖 {t('glossary.firstMention')}</label>
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

      {/* Mentioned in chapters */}
      {entry.mentionedInChapters && entry.mentionedInChapters.length > 0 && (
        <div class="form-group">
          <label class="form-label">📑 {t('glossary.chaptersMentionedLabel')}</label>
          <div class="edit-modal-chapters-block">
            {chapters?.length && onNavigateToChapter
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
              marginTop: currentImageUrls.length > 0 ? '0.75rem' : '0',
            }}
          >
            {uploadingImage
              ? `⏳ ${t('glossary.uploadImageLoading')}`
              : `📤 ${t('glossary.addImageButton')}`}
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
