import { useState, useMemo, useEffect, useCallback } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { Project, ProjectWithChapterList } from '../../types';
import { Modal, Button, AlertModal, ConfirmModal, Icon } from '../ui';
import { chapterDisplayTitle, chapterMatchesListSearch } from '../../../shared/chapterTitle';
import { api, ApiError } from '../../api/client';
import './CopyChaptersModal.css';

interface BulkDeleteChaptersModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | ProjectWithChapterList;
  onSuccess: () => Promise<void>;
}

export function BulkDeleteChaptersModal({
  isOpen,
  onClose,
  project,
  onSuccess,
}: BulkDeleteChaptersModalProps) {
  const { t } = useTranslation();
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [successModal, setSuccessModal] = useState<{ title: string; message: string } | null>(null);
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);

  const chaptersSorted = useMemo(
    () => [...project.chapters].sort((a, b) => a.number - b.number),
    [project.chapters]
  );

  const filteredChapters = useMemo(() => {
    const query = search.trim();
    if (!query) return chaptersSorted;
    return chaptersSorted.filter((chapter) => chapterMatchesListSearch(chapter, query));
  }, [chaptersSorted, search]);

  const selectedTranslatingCount = useMemo(() => {
    const idSet = new Set(selectedChapterIds);
    return chaptersSorted.filter((c) => idSet.has(c.id) && c.status === 'translating').length;
  }, [chaptersSorted, selectedChapterIds]);

  const confirmMessage = useMemo(() => {
    const parts = [t('chapterActions.deleteConfirmMessage', { count: selectedChapterIds.length })];
    if (selectedChapterIds.length > 0 && selectedChapterIds.length === chaptersSorted.length) {
      parts.push(t('bulkDeleteChapters.deleteAllWarning'));
    }
    if (selectedTranslatingCount > 0) {
      parts.push(t('bulkDeleteChapters.inProgressWarning', { count: selectedTranslatingCount }));
    }
    return parts.join(' ');
  }, [t, selectedChapterIds.length, chaptersSorted.length, selectedTranslatingCount]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedChapterIds([]);
    setSearch('');
    setShowConfirm(false);
  }, [isOpen]);

  const toggleChapter = useCallback((chapterId: string) => {
    setSelectedChapterIds((prev) =>
      prev.includes(chapterId) ? prev.filter((id) => id !== chapterId) : [...prev, chapterId]
    );
  }, []);

  const selectAllFiltered = useCallback(() => {
    setSelectedChapterIds(filteredChapters.map((c) => c.id));
  }, [filteredChapters]);

  const handleDelete = useCallback(async () => {
    if (selectedChapterIds.length === 0) return;
    setDeleting(true);
    try {
      const result = await api.bulkDeleteChapters(project.id, selectedChapterIds);
      setShowConfirm(false);
      onClose();
      await onSuccess();
      setSuccessModal({
        title: t('chapterActions.deleteSuccessTitle'),
        message: t('chapterActions.deleteSuccessMessage', { count: result.deleted }),
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_CHAPTER_IDS') {
        await onSuccess();
      }
      setShowConfirm(false);
      setErrorModal({
        title: t('chapterActions.deleteErrorTitle'),
        message: err instanceof Error ? err.message : t('chapterActions.errorGeneric'),
      });
    } finally {
      setDeleting(false);
    }
  }, [selectedChapterIds, project.id, onClose, onSuccess, t]);

  const busy = deleting;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => !busy && onClose()}
        title={t('bulkDeleteChapters.modalTitle')}
        className="copy-chapters-modal"
        layer="nested"
        preventClose={busy || showConfirm}
        footer={
          <div class="copy-chapters-footer">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => setShowConfirm(true)}
              disabled={busy || selectedChapterIds.length === 0}
            >
              {t('bulkDeleteChapters.deleteButton', { count: selectedChapterIds.length })}
            </Button>
          </div>
        }
      >
        <p class="copy-chapters-hint">{t('bulkDeleteChapters.hint')}</p>

        <input
          type="search"
          class="copy-chapters-search"
          placeholder={t('chapterList.searchPlaceholder')}
          value={search}
          disabled={busy || chaptersSorted.length === 0}
          onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
        />

        <div class="copy-chapters-selection-row">
          <button
            type="button"
            class="copy-chapters-link-btn"
            onClick={selectAllFiltered}
            disabled={filteredChapters.length === 0 || busy}
          >
            {t('chapter.selectAll')}
          </button>
          <button
            type="button"
            class="copy-chapters-link-btn copy-chapters-link-btn-dim"
            onClick={() => setSelectedChapterIds([])}
            disabled={busy}
          >
            {t('chapter.deselectAll')}
          </button>
          <span class="copy-chapters-selected-count">
            {t('bulkDeleteChapters.selectedCount', { count: selectedChapterIds.length })}
          </span>
        </div>

        <div class="copy-chapters-list">
          {chaptersSorted.length === 0 ? (
            <p class="copy-chapters-empty">{t('chapterList.noChapters')}</p>
          ) : filteredChapters.length === 0 ? (
            <p class="copy-chapters-empty">{t('chapterList.noResults')}</p>
          ) : (
            filteredChapters.map((chapter, index) => {
              const checked = selectedChapterIds.includes(chapter.id);
              const isLast = index === filteredChapters.length - 1;
              const isTranslating = chapter.status === 'translating';
              return (
                <label
                  key={chapter.id}
                  class="copy-chapters-item"
                  style={{ borderBottom: isLast ? 'none' : undefined }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={busy}
                    onChange={() => toggleChapter(chapter.id)}
                    style={{ accentColor: 'var(--accent)', flexShrink: 0 }}
                  />
                  <span class="copy-chapters-item-number">{chapter.number}</span>
                  <span class="copy-chapters-item-title">{chapterDisplayTitle(chapter)}</span>
                  {isTranslating && (
                    <span
                      class="copy-chapters-item-status is-translating"
                      title={t('chapterList.filterPending')}
                    >
                      <Icon name="translate" size="sm" />
                    </span>
                  )}
                </label>
              );
            })
          )}
        </div>
      </Modal>

      <ConfirmModal
        isOpen={showConfirm}
        onClose={() => !deleting && setShowConfirm(false)}
        onConfirm={handleDelete}
        title={t('chapterActions.deleteConfirmTitle')}
        message={confirmMessage}
        confirmLabel={t('common.delete')}
        variant="danger"
        loading={deleting}
        layer="stacked"
      />

      <AlertModal
        isOpen={!!successModal}
        onClose={() => setSuccessModal(null)}
        title={successModal?.title ?? ''}
        message={successModal?.message ?? ''}
        tone="success"
      />

      <AlertModal
        isOpen={!!errorModal}
        onClose={() => setErrorModal(null)}
        title={errorModal?.title ?? ''}
        message={errorModal?.message ?? ''}
      />
    </>
  );
}
