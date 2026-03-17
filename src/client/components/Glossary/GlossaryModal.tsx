import { useState, useMemo, useEffect, useRef } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { GlossaryEntry, GlossaryEntryType } from '../../types';
import { Modal, Button, Input, Select, Icon, AlertModal, ConfirmModal } from '../ui';
import { api } from '../../api/client';
import './GlossaryModal.css';

type FilterType = 'all' | GlossaryEntryType | 'noDescription' | 'autoDetected';
type SortBy = 'original' | 'translated' | 'firstChapter' | 'type';

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
  character: 'person',
  location: 'place',
  term: 'menu_book',
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
    setPendingChapter({
      chapterId: ch.id,
      number: num,
      title: ch.title ? ch.title : String(num),
    });
  };

  const confirmGoToChapter = () => {
    if (!pendingChapter || !onNavigateToChapter) return;
    onNavigateToChapter(pendingChapter.chapterId);
    setPendingChapter(null);
  };

  const typeLabels: Record<GlossaryEntryType, string> = {
    character: t('glossary.characters'),
    location: t('glossary.locations'),
    term: t('glossary.terms'),
  };
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortBy>('original');
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [search, setSearch] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkMarking, setBulkMarking] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineEditingValue, setInlineEditingValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    entry: GlossaryEntry;
  } | null>(null);
  const [editingEntry, setEditingEntry] = useState<GlossaryEntry | null>(null);
  const [deleteConfirmEntry, setDeleteConfirmEntry] = useState<GlossaryEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pendingChapter, setPendingChapter] = useState<{
    chapterId: string;
    number: number;
    title: string;
  } | null>(null);

  type MergeSuggestionItem = { entryIds: string[]; reason: string; suggestedPrimaryId?: string };
  const [mergeSuggestions, setMergeSuggestions] = useState<MergeSuggestionItem[] | null>(null);
  const [loadingMergeSuggestions, setLoadingMergeSuggestions] = useState(false);
  const [showMergeSuggestionsModal, setShowMergeSuggestionsModal] = useState(false);
  const [selectedMergeIndexes, setSelectedMergeIndexes] = useState<Set<number>>(new Set());
  const [keepEntryIdByIndex, setKeepEntryIdByIndex] = useState<Record<number, string>>({});
  const [applyingMerges, setApplyingMerges] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [mergeErrorModal, setMergeErrorModal] = useState<{ title: string; message: string } | null>(
    null
  );
  const [showManualMergeModal, setShowManualMergeModal] = useState(false);

  const filteredEntries = useMemo(() => {
    let list = entries.filter((entry) => {
      const matchesFilter =
        filter === 'all'
          ? true
          : filter === 'noDescription'
            ? !entry.description || entry.description.trim() === ''
            : filter === 'autoDetected'
              ? entry.autoDetected === true
              : entry.type === filter;
      const matchesSearch =
        !search ||
        entry.original.toLowerCase().includes(search.toLowerCase()) ||
        entry.translated.toLowerCase().includes(search.toLowerCase()) ||
        (entry.description ?? '').toLowerCase().includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    });
    // Sort
    const typeOrder = { character: 0, location: 1, term: 2 };
    list = [...list].sort((a, b) => {
      if (sortBy === 'original')
        return a.original.localeCompare(b.original, undefined, { sensitivity: 'base' });
      if (sortBy === 'translated')
        return a.translated.localeCompare(b.translated, undefined, { sensitivity: 'base' });
      if (sortBy === 'firstChapter') {
        const fa = a.firstAppearance ?? 9999;
        const fb = b.firstAppearance ?? 9999;
        return fa - fb;
      }
      if (sortBy === 'type') return typeOrder[a.type] - typeOrder[b.type];
      return 0;
    });
    return list;
  }, [entries, filter, search, sortBy]);

  const counts = useMemo(
    () => ({
      all: entries.length,
      character: entries.filter((e) => e.type === 'character').length,
      location: entries.filter((e) => e.type === 'location').length,
      term: entries.filter((e) => e.type === 'term').length,
      noDescription: entries.filter((e) => !e.description || e.description.trim() === '').length,
      autoDetected: entries.filter((e) => e.autoDetected === true).length,
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

  const toggleSelectEntry = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredEntries.map((e) => e.id)));
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      for (const id of selectedIds) {
        await api.deleteGlossaryEntry(projectId, id);
      }
      setSelectedIds(new Set());
      setSelectMode(false);
      onUpdate();
    } catch (err) {
      console.error('Bulk delete failed:', err);
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleInlineTranslatedStart = (entry: GlossaryEntry, e: Event) => {
    e.stopPropagation();
    if (selectMode) return;
    setInlineEditingId(entry.id);
    setInlineEditingValue(entry.translated);
  };

  const handleInlineTranslatedSave = async (entryId: string) => {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry || inlineEditingValue.trim() === entry.translated) {
      setInlineEditingId(null);
      return;
    }
    try {
      await api.updateGlossaryEntry(projectId, entryId, { translated: inlineEditingValue.trim() });
      onUpdate();
    } catch (err) {
      console.error('Inline save failed:', err);
    }
    setInlineEditingId(null);
  };

  const handleInlineTranslatedKeyDown = (entryId: string, e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInlineTranslatedSave(entryId);
    } else if (e.key === 'Escape') {
      setInlineEditingId(null);
      (e.target as HTMLInputElement).blur();
    }
  };

  useEffect(() => {
    const closeContextMenu = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', closeContextMenu);
      return () => document.removeEventListener('click', closeContextMenu);
    }
  }, [contextMenu]);

  const handleBulkMarkReviewed = async () => {
    if (selectedIds.size === 0) return;
    setBulkMarking(true);
    try {
      for (const id of selectedIds) {
        await api.updateGlossaryEntry(projectId, id, { autoDetected: false });
      }
      setSelectedIds(new Set());
      setSelectMode(false);
      onUpdate();
    } catch (err) {
      console.error('Bulk mark reviewed failed:', err);
    } finally {
      setBulkMarking(false);
    }
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
      setMergeErrorModal({
        title: t('glossary.mergeError'),
        message: t('glossary.mergeError'),
      });
    } finally {
      setApplyingMerges(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={t('glossary.title')}
        size="large"
        footer={
          <>
            {selectMode ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSelectMode(false);
                    setSelectedIds(new Set());
                  }}
                >
                  {t('glossary.cancelSelect')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={selectAllFiltered}
                  disabled={filteredEntries.length === 0}
                >
                  {t('chapter.selectAll')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  disabled={selectedIds.size === 0}
                  loading={bulkDeleting}
                >
                  {t('glossary.deleteSelected', { count: selectedIds.size })}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleBulkMarkReviewed}
                  disabled={selectedIds.size === 0}
                  loading={bulkMarking}
                >
                  <Icon name="check" size="sm" />{' '}
                  {t('glossary.markReviewed', { count: selectedIds.size })}
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={onClose}>
                  {t('common.close')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setSelectMode(true)}
                  disabled={entries.length === 0}
                >
                  {t('glossary.selectMode')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleSuggestMerges}
                  disabled={entries.length < 2 || loadingMergeSuggestions}
                  title={entries.length < 2 ? t('glossary.noSuggestions') : undefined}
                >
                  {loadingMergeSuggestions
                    ? t('glossary.suggestMergesLoading')
                    : t('glossary.suggestMerges')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowManualMergeModal(true)}
                  disabled={entries.length < 2}
                  title={entries.length < 2 ? t('glossary.noSuggestions') : undefined}
                >
                  {t('glossary.manualMerge')}
                </Button>
                <Button onClick={() => setShowAddModal(true)}>
                  <Icon name="add" size="sm" /> {t('glossary.addEntry')}
                </Button>
              </>
            )}
          </>
        }
      >
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
            {(
              [
                'all',
                'character',
                'location',
                'term',
                'noDescription',
                'autoDetected',
              ] as FilterType[]
            ).map((f) => (
              <button
                key={f}
                class={`filter-btn ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all'
                  ? t('glossary.all')
                  : f === 'noDescription'
                    ? t('glossary.filterNoDescription')
                    : f === 'autoDetected'
                      ? t('glossary.filterAutoDetected')
                      : typeLabels[f]}
                <span>{counts[f]}</span>
              </button>
            ))}
          </div>
          <div class="glossary-toolbar-row">
            <div class="glossary-sort-row">
              <label class="glossary-sort-label">{t('glossary.sortBy')}:</label>
              <select
                class="glossary-sort-select form-input"
                value={sortBy}
                onChange={(e) => setSortBy((e.target as HTMLSelectElement).value as SortBy)}
              >
                <option value="original">{t('glossary.sortOriginal')}</option>
                <option value="translated">{t('glossary.sortTranslated')}</option>
                <option value="firstChapter">{t('glossary.sortFirstChapter')}</option>
                <option value="type">{t('glossary.sortType')}</option>
              </select>
            </div>
            <div class="glossary-view-toggle">
              <button
                type="button"
                class={`glossary-view-btn ${viewMode === 'cards' ? 'active' : ''}`}
                onClick={() => setViewMode('cards')}
                title={t('glossary.viewCards')}
              >
                <Icon name="grid_view" size="sm" />
              </button>
              <button
                type="button"
                class={`glossary-view-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title={t('glossary.viewList')}
              >
                <Icon name="view_list" size="sm" />
              </button>
            </div>
          </div>
        </div>

        <div class={`glossary-grid ${viewMode === 'list' ? 'glossary-grid-list' : ''}`}>
          {filteredEntries.length === 0 ? (
            <div class="glossary-empty">
              <div class="glossary-empty-icon">GL</div>
              <p>{entries.length === 0 ? t('glossary.empty') : t('glossary.noResults')}</p>
            </div>
          ) : (
            filteredEntries.map((entry) => {
              // Get first image from gallery (support legacy imageUrl)
              const firstImage = entry.imageUrls?.[0] || entry.imageUrl;
              const isSelected = selectedIds.has(entry.id);

              return (
                <div
                  key={entry.id}
                  data-type={entry.type}
                  class={`glossary-card ${selectMode ? 'glossary-card-select-mode' : ''} ${isSelected ? 'glossary-card-selected' : ''}`}
                  role="button"
                  tabIndex={0}
                  title={!selectMode ? t('glossary.clickToEdit') : undefined}
                  aria-label={`${typeLabels[entry.type]}: ${entry.original}, ${t('glossary.translated')}: ${entry.translated}`}
                  onClick={() => {
                    if (selectMode) {
                      toggleSelectEntry(entry.id);
                    } else if (inlineEditingId !== entry.id) {
                      setEditingEntry(entry);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (selectMode) return;
                    setContextMenu({ x: e.clientX, y: e.clientY, entry });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (selectMode) toggleSelectEntry(entry.id);
                      else if (inlineEditingId !== entry.id) setEditingEntry(entry);
                    }
                  }}
                >
                  {selectMode && (
                    <div class="glossary-card-checkbox">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectEntry(entry.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  )}
                  <div class="glossary-card-header">
                    {firstImage ? (
                      <img src={firstImage} alt={entry.translated} class="glossary-card-image" />
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
                        {inlineEditingId === entry.id ? (
                          <input
                            type="text"
                            class="glossary-card-inline-input form-input"
                            value={inlineEditingValue}
                            onInput={(e) =>
                              setInlineEditingValue((e.target as HTMLInputElement).value)
                            }
                            onBlur={() => handleInlineTranslatedSave(entry.id)}
                            onKeyDown={(e) => handleInlineTranslatedKeyDown(entry.id, e)}
                            onClick={(e) => e.stopPropagation()}
                            ref={(el) => el?.focus()}
                          />
                        ) : (
                          <span
                            class="glossary-card-translated glossary-card-translated-editable"
                            title={`${entry.translated} (${t('glossary.contextEdit')})`}
                            onDblClick={(e) => handleInlineTranslatedStart(entry, e)}
                          >
                            {entry.translated}
                          </span>
                        )}
                      </div>
                      <div class="glossary-card-header-badges">
                        {entry.type === 'character' &&
                          entry.gender &&
                          entry.gender !== 'unknown' && (
                            <span
                              class="glossary-card-gender"
                              title={
                                entry.gender === 'male'
                                  ? t('glossary.genderMale')
                                  : entry.gender === 'female'
                                    ? t('glossary.genderFemale')
                                    : t('glossary.genderNeutral')
                              }
                            >
                              {entry.gender === 'male'
                                ? '♂'
                                : entry.gender === 'female'
                                  ? '♀'
                                  : '⚧'}
                            </span>
                          )}
                        {entry.mentionedInChapters && entry.mentionedInChapters.length > 0 && (
                          <span
                            class="glossary-card-badge glossary-card-chapters-count"
                            title={
                              t('glossary.chaptersMentionedLabel') +
                              ': ' +
                              entry.mentionedInChapters.join(', ')
                            }
                          >
                            {entry.mentionedInChapters.length}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {entry.description?.trim() && (
                    <div class="glossary-card-description" title={entry.description}>
                      {entry.description}
                    </div>
                  )}

                  {entry.notes?.trim() && (
                    <div class="glossary-card-notes" title={entry.notes}>
                      {entry.notes}
                    </div>
                  )}

                  {entry.mentionedInChapters &&
                    entry.mentionedInChapters.length > 0 &&
                    (() => {
                      const chList = entry.mentionedInChapters!;
                      const maxPills = 5;
                      const showPills = chList.slice(0, maxPills);
                      const restCount = chList.length - maxPills;
                      const fullList = chList.join(', ');
                      return (
                        <div
                          class="glossary-card-chapters"
                          title={t('glossary.chaptersMentionedLabel') + ': ' + fullList}
                        >
                          {chapters?.length && onNavigateToChapter ? (
                            <>
                              {showPills.map((num) => {
                                const ch = chapters.find((c) => c.number === num);
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
                              })}
                              {restCount > 0 && (
                                <span
                                  class="glossary-chapter-pill glossary-chapter-pill-more"
                                  title={fullList}
                                >
                                  +{restCount}
                                </span>
                              )}
                            </>
                          ) : restCount > 0 ? (
                            `${showPills.join(', ')} +${restCount}`
                          ) : (
                            t('glossary.mentionedInChapters', { chapters: fullList })
                          )}
                        </div>
                      );
                    })()}

                  <button
                    class="glossary-card-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmEntry(entry);
                    }}
                    title={t('glossary.deleteEntryTitle')}
                  >
                    <Icon name="delete" size="sm" />
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
          <>
            <p class="glossary-merge-hint">{t('glossary.mergeSuggestionsHint')}</p>
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
                                  <Icon name={typeIcons[entry.type]} size="sm" />
                                </span>
                                <div class="glossary-merge-entry-card-names">
                                  <span class="glossary-merge-entry-original">
                                    {entry.original}
                                  </span>
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
                              {entry.mentionedInChapters &&
                                entry.mentionedInChapters.length > 0 && (
                                  <div class="glossary-merge-entry-chapters">
                                    {entry.mentionedInChapters.length} ch.
                                  </div>
                                )}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div class="glossary-merge-col glossary-merge-col-result">
                        <div
                          class="glossary-merge-col-label"
                          title={t('glossary.keepAsPrimaryHint')}
                        >
                          {t('glossary.keepAsPrimary')}
                        </div>
                        {keepEntry && (
                          <div class="glossary-merge-entry-card glossary-merge-entry-card-keep">
                            <div class="glossary-merge-entry-card-header">
                              <span
                                class="glossary-merge-entry-card-icon"
                                title={typeLabels[keepEntry.type]}
                              >
                                <Icon name={typeIcons[keepEntry.type]} size="sm" />
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
          </>
        )}
      </Modal>

      {/* Add Entry Modal */}
      <AddGlossaryModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        projectId={projectId}
        onAdd={onUpdate}
      />

      {/* Manual Merge Modal */}
      {showManualMergeModal && (
        <ManualMergeModal
          isOpen={showManualMergeModal}
          onClose={() => setShowManualMergeModal(false)}
          projectId={projectId}
          entries={entries}
          typeIcons={typeIcons}
          onSuccess={() => {
            setShowManualMergeModal(false);
            onUpdate();
          }}
          onError={(title, message) => setMergeErrorModal({ title, message })}
        />
      )}

      {/* Edit Entry Modal */}
      {editingEntry && (
        <EditGlossaryModal
          isOpen={true}
          onClose={() => setEditingEntry(null)}
          projectId={projectId}
          entry={editingEntry}
          entries={entries}
          chapters={chapters}
          typeIcons={typeIcons}
          typeLabels={typeLabels}
          onRequestNavigateToChapter={(chapterId, num, title) =>
            setPendingChapter({ chapterId, number: num, title })
          }
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

      {/* Context Menu */}
      {contextMenu && (
        <div class="glossary-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button
            type="button"
            class="glossary-context-menu-item"
            onClick={() => {
              setEditingEntry(contextMenu.entry);
              setContextMenu(null);
            }}
          >
            {t('glossary.contextEdit')}
          </button>
          {contextMenu.entry.autoDetected && (
            <button
              type="button"
              class="glossary-context-menu-item"
              onClick={async () => {
                await api.updateGlossaryEntry(projectId, contextMenu.entry.id, {
                  autoDetected: false,
                });
                onUpdate();
                setContextMenu(null);
              }}
            >
              <Icon name="check" size="sm" /> {t('glossary.contextMarkReviewed')}
            </button>
          )}
          <button
            type="button"
            class="glossary-context-menu-item glossary-context-menu-item-danger"
            onClick={() => {
              setDeleteConfirmEntry(contextMenu.entry);
              setContextMenu(null);
            }}
          >
            {t('glossary.contextDelete')}
          </button>
        </div>
      )}

      {/* Delete Confirm Modal */}
      <Modal
        isOpen={deleteConfirmEntry !== null}
        onClose={() => setDeleteConfirmEntry(null)}
        title={t('glossary.deleteEntryConfirmTitle')}
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

      {/* Go to chapter confirmation modal */}
      <Modal
        isOpen={pendingChapter !== null}
        onClose={() => setPendingChapter(null)}
        title={t('glossary.goToChapterTitle')}
        className="nested glossary-go-to-chapter-confirm-modal"
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
          <p class="glossary-go-to-chapter-confirm-text">
            {t('glossary.goToChapterConfirm', {
              num: pendingChapter.number,
              title: pendingChapter.title,
            })}
          </p>
        )}
      </Modal>

      <ConfirmModal
        isOpen={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        onConfirm={handleBulkDelete}
        title={t('glossary.deleteSelectedConfirm', { count: selectedIds.size })}
        message={t('glossary.deleteSelectedConfirm', { count: selectedIds.size })}
        confirmLabel={t('common.delete')}
        variant="danger"
        loading={bulkDeleting}
      />

      <AlertModal
        isOpen={!!mergeErrorModal}
        onClose={() => setMergeErrorModal(null)}
        title={mergeErrorModal?.title ?? ''}
        message={mergeErrorModal?.message ?? ''}
      />
    </>
  );
}

// === GlossaryEntrySelect (dropdown with search) ===

interface GlossaryEntrySelectProps {
  entries: GlossaryEntry[];
  value: GlossaryEntry | null;
  onChange: (entry: GlossaryEntry | null) => void;
  excludeIds?: string[];
  filterByType?: GlossaryEntryType;
  placeholder?: string;
  typeIcons: Record<GlossaryEntryType, string>;
}

function GlossaryEntrySelect({
  entries,
  value,
  onChange,
  excludeIds = [],
  filterByType,
  placeholder,
  typeIcons,
}: GlossaryEntrySelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const filteredEntries = useMemo(() => {
    let list = entries.filter((e) => !excludeIds.includes(e.id));
    if (filterByType) list = list.filter((e) => e.type === filterByType);
    if (!searchQuery.trim()) return list;
    const q = searchQuery.trim().toLowerCase();
    return list.filter(
      (e) => e.original.toLowerCase().includes(q) || e.translated.toLowerCase().includes(q)
    );
  }, [entries, excludeIds, filterByType, searchQuery]);

  const handleSelect = (entry: GlossaryEntry) => {
    onChange(entry);
    setOpen(false);
    setSearchQuery('');
  };

  return (
    <div class="glossary-entry-select" ref={wrapperRef}>
      <button
        type="button"
        class="glossary-entry-select-trigger form-input"
        onClick={() => setOpen(!open)}
      >
        {value ? (
          <span class="glossary-entry-select-value">
            <Icon name={typeIcons[value.type]} size="sm" />
            {value.original} → {value.translated}
          </span>
        ) : (
          <span class="glossary-entry-select-placeholder">{placeholder}</span>
        )}
      </button>
      {open && (
        <div class="glossary-entry-select-dropdown">
          <Input
            placeholder={t('glossary.relationshipsSearchPlaceholder')}
            value={searchQuery}
            onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
            style={{ margin: '0.5rem' }}
          />
          <div class="glossary-entry-select-list">
            {filteredEntries.map((e) => (
              <button
                key={e.id}
                type="button"
                class="glossary-entry-select-item"
                onClick={() => handleSelect(e)}
              >
                <Icon name={typeIcons[e.type]} size="sm" />
                {e.original} → {e.translated}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// === Manual Merge Modal ===

interface ManualMergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  entries: GlossaryEntry[];
  typeIcons: Record<GlossaryEntryType, string>;
  onSuccess: () => void;
  onError: (title: string, message: string) => void;
}

function ManualMergeModal({
  isOpen,
  onClose,
  projectId,
  entries,
  typeIcons,
  onSuccess,
  onError,
}: ManualMergeModalProps) {
  const { t } = useTranslation();
  const [leftEntry, setLeftEntry] = useState<GlossaryEntry | null>(null);
  const [rightEntry, setRightEntry] = useState<GlossaryEntry | null>(null);
  const [keepLeft, setKeepLeft] = useState(true);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setLeftEntry(null);
      setRightEntry(null);
      setKeepLeft(true);
    }
  }, [isOpen]);

  const canMerge =
    leftEntry && rightEntry && leftEntry.id !== rightEntry.id && leftEntry.type === rightEntry.type;

  const handleMerge = async () => {
    if (!canMerge) return;
    setMerging(true);
    try {
      await api.mergeGlossaryEntries(projectId, {
        entryIds: [leftEntry!.id, rightEntry!.id],
        keepEntryId: keepLeft ? leftEntry!.id : rightEntry!.id,
      });
      onSuccess();
    } catch (err) {
      onError(
        t('glossary.mergeError'),
        err instanceof Error ? err.message : t('glossary.mergeError')
      );
    } finally {
      setMerging(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('glossary.manualMergeTitle')}
      className="nested"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleMerge} disabled={!canMerge} loading={merging}>
            {t('glossary.manualMergeApply')}
          </Button>
        </>
      }
    >
      <div class="glossary-manual-merge-form">
        <div class="form-group">
          <label class="form-label">{t('glossary.manualMergeLeft')}</label>
          <GlossaryEntrySelect
            entries={entries}
            value={leftEntry}
            onChange={setLeftEntry}
            excludeIds={rightEntry ? [rightEntry.id] : []}
            placeholder={t('glossary.manualMergeSelectPlaceholder')}
            typeIcons={typeIcons}
          />
        </div>
        <div class="form-group">
          <label class="form-label">{t('glossary.manualMergeRight')}</label>
          <GlossaryEntrySelect
            entries={entries}
            value={rightEntry}
            onChange={setRightEntry}
            excludeIds={leftEntry ? [leftEntry.id] : []}
            filterByType={leftEntry?.type}
            placeholder={t('glossary.manualMergeSelectPlaceholder')}
            typeIcons={typeIcons}
          />
        </div>
        <div class="form-group">
          <label class="form-label">{t('glossary.manualMergeKeep')}</label>
          <div class="glossary-manual-merge-radio">
            <label>
              <input
                type="radio"
                name="keep"
                checked={keepLeft}
                onChange={() => setKeepLeft(true)}
              />
              {t('glossary.manualMergeKeepLeft')}
            </label>
            <label>
              <input
                type="radio"
                name="keep"
                checked={!keepLeft}
                onChange={() => setKeepLeft(false)}
              />
              {t('glossary.manualMergeKeepRight')}
            </label>
          </div>
        </div>
        {leftEntry && rightEntry && leftEntry.id === rightEntry.id && (
          <p class="form-hint glossary-manual-merge-hint">{t('glossary.manualMergeSameEntry')}</p>
        )}
      </div>
    </Modal>
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
      title={t('glossary.newEntryTitle')}
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
          { value: 'character', label: t('glossary.characters') },
          { value: 'location', label: t('glossary.locations') },
          { value: 'term', label: t('glossary.terms') },
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
        <label class="form-label">{t('glossary.descriptionOptionalLabel')}</label>
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

// === Relationships Modal (nested, with checkboxes) ===

interface RelationshipsModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: GlossaryEntry[];
  selectedIds: string[];
  onApply: (ids: string[]) => void;
  typeIcons: Record<GlossaryEntryType, string>;
  typeLabels: Record<GlossaryEntryType, string>;
  currentEntry: GlossaryEntry;
  chapters?: ChapterRef[];
}

type GroupKey = number | 'other';

function RelationshipsModal({
  isOpen,
  onClose,
  entries,
  selectedIds,
  onApply,
  typeIcons,
  typeLabels,
  currentEntry,
  chapters,
}: RelationshipsModalProps) {
  const { t } = useTranslation();
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      setDraftIds(selectedIds);
      setSearchQuery('');
    }
  }, [isOpen, selectedIds]);

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.trim().toLowerCase();
    return entries.filter(
      (e) => e.original.toLowerCase().includes(q) || e.translated.toLowerCase().includes(q)
    );
  }, [entries, searchQuery]);

  const groupedEntries = useMemo(() => {
    const currentChapters = currentEntry.mentionedInChapters;
    const sortedChapterNums =
      currentChapters?.length && currentChapters.length > 0
        ? [...currentChapters].sort((a, b) => a - b)
        : [];

    const assignedIds = new Set<string>();
    const groups: { key: GroupKey; entries: GlossaryEntry[] }[] = [];

    for (const chNum of sortedChapterNums) {
      const inChapter = filteredEntries.filter(
        (e) => !assignedIds.has(e.id) && e.mentionedInChapters?.includes(chNum)
      );
      inChapter.forEach((e) => assignedIds.add(e.id));
      if (inChapter.length > 0) {
        groups.push({ key: chNum, entries: inChapter });
      }
    }

    const other = filteredEntries.filter((e) => !assignedIds.has(e.id));
    if (other.length > 0) {
      groups.push({ key: 'other', entries: other });
    }

    return groups;
  }, [filteredEntries, currentEntry.mentionedInChapters]);

  const toggleEntry = (id: string) => {
    setDraftIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleApply = () => {
    onApply(draftIds);
    onClose();
  };

  const renderGroupTitle = (key: GroupKey) => {
    if (key === 'other') {
      return t('glossary.relationshipsGroupOther');
    }
    const ch = chapters?.find((c) => c.number === key);
    if (ch?.title) {
      return t('glossary.relationshipsGroupChapterWithTitle', {
        num: key,
        title: ch.title,
      });
    }
    return t('glossary.relationshipsGroupChapter', { num: key });
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('glossary.relationshipsModalTitle')}
      className="nested"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleApply}>{t('glossary.relationshipsApply')}</Button>
        </>
      }
    >
      <p class="form-hint" style={{ marginBottom: '0.75rem' }}>
        {t('glossary.relationshipsHint')}
      </p>
      {entries.length > 20 && (
        <div class="form-group" style={{ marginBottom: '0.75rem' }}>
          <Input
            placeholder={t('glossary.relationshipsSearchPlaceholder')}
            value={searchQuery}
            onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
          />
        </div>
      )}
      <div class="glossary-relationships-modal-list">
        {groupedEntries.map(({ key, entries: groupEntries }) => (
          <div key={key} class="glossary-relationships-group">
            <div class="glossary-relationships-group-title">{renderGroupTitle(key)}</div>
            {groupEntries.map((e) => (
              <label
                key={e.id}
                class="glossary-relationships-checkbox-row"
                title={`${e.original} → ${e.translated}`}
              >
                <input
                  type="checkbox"
                  checked={draftIds.includes(e.id)}
                  onChange={() => toggleEntry(e.id)}
                />
                <span class="glossary-relationships-checkbox-icon" title={typeLabels[e.type]}>
                  <Icon name={typeIcons[e.type]} size="sm" />
                </span>
                <span class="glossary-relationships-checkbox-text">
                  {e.original} → {e.translated}
                </span>
              </label>
            ))}
          </div>
        ))}
      </div>
      {filteredEntries.length === 0 && searchQuery.trim() && (
        <p class="form-hint" style={{ marginTop: '0.5rem' }}>
          {t('glossary.relationshipsSearchEmpty')}
        </p>
      )}
    </Modal>
  );
}

// === Edit Modal ===

interface EditGlossaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  entry: GlossaryEntry;
  entries: GlossaryEntry[];
  chapters?: ChapterRef[];
  typeIcons: Record<GlossaryEntryType, string>;
  typeLabels: Record<GlossaryEntryType, string>;
  /** Opens confirmation modal; parent handles actual navigation on confirm */
  onRequestNavigateToChapter?: (chapterId: string, num: number, title: string) => void;
  onNavigateToChapter?: (chapterId: string) => void;
  onUpdate: () => void;
  onDelete: (entry: GlossaryEntry) => void;
}

function EditGlossaryModal({
  isOpen,
  onClose,
  projectId,
  entry,
  entries,
  chapters,
  typeIcons,
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
  } | null>(null);

  const handleChapterClick = (num: number) => {
    if (!chapters?.length) return;
    const ch = chapters.find((c) => c.number === num);
    if (!ch) return;
    const title = ch.title ? ch.title : String(num);
    if (onRequestNavigateToChapter) {
      onRequestNavigateToChapter(ch.id, num, title);
    } else if (onNavigateToChapter) {
      setGoToChapterConfirm({ chapterId: ch.id, num, title });
    }
  };

  const handleConfirmGoToChapter = () => {
    if (!goToChapterConfirm || !onNavigateToChapter) return;
    onNavigateToChapter(goToChapterConfirm.chapterId);
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
    // Migrate from legacy imageUrl if needed
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

  // Update all fields when entry changes
  useEffect(() => {
    setType(entry.type);
    setOriginal(entry.original);
    setTranslated(entry.translated);
    setDescription(entry.description || '');
    setNotes(entry.notes || '');
    setGender(entry.gender || 'unknown');
    setRelatedEntryIds(entry.relatedEntryIds ?? []);
    setPrimaryLocationId(entry.primaryLocationId ?? '');
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

        {/* First Appearance Info */}
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

        {/* Mentioned in chapters */}
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

        {/* Relationships */}
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

        {/* Relationships modal (nested) */}
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
            typeIcons={typeIcons}
            typeLabels={typeLabels}
            currentEntry={entry}
            chapters={chapters}
          />
        )}

        {/* Primary location (characters only) */}
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

        {/* Image Gallery Section */}
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
