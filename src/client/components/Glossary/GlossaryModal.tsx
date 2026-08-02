import { useState, useMemo, useEffect, useRef } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { GlossaryEntry, GlossaryEntryType } from '../../types.js';
import { Modal, Button, Icon, AlertModal, ConfirmModal } from '../ui/index.js';
import { api } from '../../api/client.js';
import { countNewImportRows, parseImportPreviewText } from './glossaryImportParse.js';
import { glossaryTypeIcons } from './glossaryTypeIcons.js';
import { GlossaryTypeFilterBar } from './GlossaryTypeFilterBar.js';
import { AddGlossaryModal } from './AddGlossaryModal.js';
import { ManualMergeModal } from './ManualMergeModal.js';
import { EditGlossaryModal } from './EditGlossaryModal.js';
import type { ChapterRef } from './glossaryTypes.js';
import './GlossaryModal.css';

export type { ChapterRef } from './glossaryTypes.js';

type FilterType = 'all' | GlossaryEntryType | 'noDescription' | 'autoDetected';
type SortBy = 'original' | 'translated' | 'firstChapter' | 'type';

interface GlossaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  entries: GlossaryEntry[];
  onUpdate: () => void;
  /** Optional: list of chapters (number → id, title) for pills and navigation */
  chapters?: ChapterRef[];
  /** Optional: when user confirms, navigate to this chapter (modal will close from parent) */
  onNavigateToChapter?: (chapterId: string, searchTerm?: string) => void;
}

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

  const handleChapterClick = (num: number, searchTerm?: string) => {
    if (!onNavigateToChapter || !chapters?.length) return;
    const ch = chapters.find((c) => c.number === num);
    if (!ch) return;
    setPendingChapter({
      chapterId: ch.id,
      number: num,
      title: ch.title ? ch.title : String(num),
      searchTerm: searchTerm?.trim() || undefined,
    });
  };

  const confirmGoToChapter = () => {
    if (!pendingChapter || !onNavigateToChapter) return;
    onNavigateToChapter(pendingChapter.chapterId, pendingChapter.searchTerm);
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
    searchTerm?: string;
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
  const [displayEntries, setDisplayEntries] = useState<GlossaryEntry[]>(entries);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<{
    total: number;
    newCount: number;
    skipped: number;
    parseError?: string;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    added: number;
    skipped: number;
    errorCount: number;
  } | null>(null);
  const [showFileActionsMenu, setShowFileActionsMenu] = useState(false);
  const fileActionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDisplayEntries(entries);
  }, [entries]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    api
      .getGlossary(projectId)
      .then((list) => {
        if (!cancelled) setDisplayEntries(list);
      })
      .catch((err) => {
        console.error('Failed to load glossary:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, projectId]);

  const filteredEntries = useMemo(() => {
    let list = displayEntries.filter((entry) => {
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
  }, [displayEntries, filter, search, sortBy]);

  const counts = useMemo(
    () => ({
      all: displayEntries.length,
      character: displayEntries.filter((e) => e.type === 'character').length,
      location: displayEntries.filter((e) => e.type === 'location').length,
      term: displayEntries.filter((e) => e.type === 'term').length,
      noDescription: displayEntries.filter((e) => !e.description || e.description.trim() === '')
        .length,
      autoDetected: displayEntries.filter((e) => e.autoDetected === true).length,
    }),
    [displayEntries]
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

  const handleExportGlossary = async (format: 'json' | 'csv') => {
    setShowFileActionsMenu(false);
    setExporting(true);
    try {
      await api.exportGlossary(projectId, format);
    } catch (error) {
      console.error('Failed to export glossary:', error);
      setMergeErrorModal({
        title: t('glossary.exportError'),
        message: error instanceof Error ? error.message : t('glossary.exportError'),
      });
    } finally {
      setExporting(false);
    }
  };

  const handleImportFileSelect = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const { rows, parseError } = parseImportPreviewText(text, file.name);
      if (parseError && rows.length === 0) {
        setMergeErrorModal({
          title: t('glossary.importError'),
          message: parseError,
        });
        return;
      }
      const counts = countNewImportRows(rows, displayEntries);
      setPendingImportFile(file);
      setImportPreview({ ...counts, parseError });
      setShowImportConfirm(true);
    } catch (error) {
      console.error('Failed to read import file:', error);
      setMergeErrorModal({
        title: t('glossary.importError'),
        message: error instanceof Error ? error.message : t('glossary.importError'),
      });
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingImportFile) return;
    setImporting(true);
    try {
      const result = await api.importGlossary(projectId, pendingImportFile);
      const list = await api.getGlossary(projectId);
      setDisplayEntries(list);
      onUpdate();
      setImportResult({
        added: result.added,
        skipped: result.skipped,
        errorCount: result.errors.length,
      });
    } catch (error) {
      console.error('Failed to import glossary:', error);
      setMergeErrorModal({
        title: t('glossary.importError'),
        message: error instanceof Error ? error.message : t('glossary.importError'),
      });
    } finally {
      setImporting(false);
      setShowImportConfirm(false);
      setPendingImportFile(null);
      setImportPreview(null);
    }
  };

  const handleSuggestMerges = async () => {
    if (displayEntries.length < 2) return;
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
      await api.deleteGlossaryEntries(projectId, [...selectedIds]);
      setSelectedIds(new Set());
      setSelectMode(false);
      setShowBulkDeleteConfirm(false);
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
    const entry = displayEntries.find((e) => e.id === entryId);
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

  useEffect(() => {
    if (!showFileActionsMenu) return;
    const closeMenu = (e: MouseEvent) => {
      if (fileActionsRef.current && !fileActionsRef.current.contains(e.target as Node)) {
        setShowFileActionsMenu(false);
      }
    };
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, [showFileActionsMenu]);

  useEffect(() => {
    if (!isOpen) {
      setShowFileActionsMenu(false);
    }
  }, [isOpen]);

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
        headerActions={
          !selectMode ? (
            <div class="glossary-file-actions" ref={fileActionsRef}>
              <button
                type="button"
                class="glossary-file-actions-trigger"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFileActionsMenu((open) => !open);
                }}
                aria-label={t('glossary.fileActions')}
                aria-expanded={showFileActionsMenu}
                aria-haspopup="menu"
                title={t('glossary.fileActions')}
                disabled={exporting || importing}
              >
                <Icon name="more_vert" size="sm" />
              </button>
              {showFileActionsMenu && (
                <div class="glossary-file-actions-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    class="glossary-file-actions-menu-item"
                    disabled={exporting}
                    onClick={() => void handleExportGlossary('json')}
                  >
                    <Icon name="download" size="sm" />
                    {t('glossary.exportJson')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    class="glossary-file-actions-menu-item"
                    disabled={exporting}
                    onClick={() => void handleExportGlossary('csv')}
                  >
                    <Icon name="download" size="sm" />
                    {t('glossary.exportCsv')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    class="glossary-file-actions-menu-item"
                    disabled={importing}
                    onClick={() => {
                      setShowFileActionsMenu(false);
                      importFileRef.current?.click();
                    }}
                  >
                    <Icon name="upload_file" size="sm" />
                    {t('glossary.import')}
                  </button>
                </div>
              )}
            </div>
          ) : undefined
        }
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
                  disabled={displayEntries.length === 0}
                >
                  {t('glossary.selectMode')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleSuggestMerges}
                  disabled={displayEntries.length < 2 || loadingMergeSuggestions}
                  title={displayEntries.length < 2 ? t('glossary.noSuggestions') : undefined}
                >
                  {loadingMergeSuggestions
                    ? t('glossary.suggestMergesLoading')
                    : t('glossary.suggestMerges')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowManualMergeModal(true)}
                  disabled={displayEntries.length < 2}
                  title={displayEntries.length < 2 ? t('glossary.noSuggestions') : undefined}
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
        <input
          ref={importFileRef}
          type="file"
          accept=".json,.csv,application/json,text/csv"
          style="display: none"
          onChange={handleImportFileSelect}
        />
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
          <GlossaryTypeFilterBar
            filter={filter}
            onFilterChange={(f) => setFilter(f as FilterType)}
            counts={{
              all: counts.all,
              character: counts.character,
              location: counts.location,
              term: counts.term,
            }}
            extraFilters={[
              {
                id: 'noDescription',
                label: t('glossary.filterNoDescription'),
                count: counts.noDescription,
              },
              {
                id: 'autoDetected',
                label: t('glossary.filterAutoDetected'),
                count: counts.autoDetected,
              },
            ]}
            showTypeIcons={false}
          />
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
              <p>{displayEntries.length === 0 ? t('glossary.empty') : t('glossary.noResults')}</p>
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
                        <Icon name={glossaryTypeIcons[entry.type]} />
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
                                      const term =
                                        entry.translated?.trim() || entry.original?.trim() || '';
                                      handleChapterClick(num, term || undefined);
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
                  .map((id) => displayEntries.find((x) => x.id === id))
                  .filter(Boolean) as GlossaryEntry[];
                const keepId =
                  keepEntryIdByIndex[index] ??
                  suggestion.suggestedPrimaryId ??
                  suggestion.entryIds[0];
                const keepEntry = displayEntries.find((x) => x.id === keepId);
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
                                  <Icon name={glossaryTypeIcons[entry.type]} size="sm" />
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
                                <Icon name={glossaryTypeIcons[keepEntry.type]} size="sm" />
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
                                const e = displayEntries.find((x) => x.id === id);
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
          entries={displayEntries}
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
          entries={displayEntries}
          chapters={chapters}
          typeLabels={typeLabels}
          onRequestNavigateToChapter={(chapterId, num, title, searchTerm) =>
            setPendingChapter({ chapterId, number: num, title, searchTerm })
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

      <ConfirmModal
        isOpen={showImportConfirm}
        onClose={() => {
          if (importing) return;
          setShowImportConfirm(false);
          setPendingImportFile(null);
          setImportPreview(null);
        }}
        onConfirm={handleConfirmImport}
        title={t('glossary.importConfirmTitle')}
        message={
          importPreview
            ? t('glossary.importConfirmMessage', {
                total: importPreview.total,
                newCount: importPreview.newCount,
                skipped: importPreview.skipped,
              })
            : ''
        }
        confirmLabel={t('glossary.importConfirmButton')}
        loading={importing}
      />

      <AlertModal
        isOpen={!!importResult}
        onClose={() => setImportResult(null)}
        title={t('glossary.importResultTitle')}
        tone="success"
        message={
          importResult
            ? t('glossary.importResultMessage', {
                added: importResult.added,
                skipped: importResult.skipped,
                errorCount: importResult.errorCount,
              })
            : ''
        }
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
