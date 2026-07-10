import { useState, useMemo, useEffect, useCallback } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { Project, ProjectWithChapterList } from '../../types';
import { Modal, Button, AlertModal, ConfirmModal } from '../ui';
import { ChapterPickerPanel } from './ChapterPickerPanel';
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
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pickerResetKey, setPickerResetKey] = useState(0);
  const [successModal, setSuccessModal] = useState<{ title: string; message: string } | null>(null);
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);

  const chaptersSorted = useMemo(
    () => [...project.chapters].sort((a, b) => a.number - b.number),
    [project.chapters]
  );

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
    setShowConfirm(false);
    setPickerResetKey((k) => k + 1);
  }, [isOpen]);

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

        <ChapterPickerPanel
          chapters={chaptersSorted}
          selectedIds={selectedChapterIds}
          onSelectedIdsChange={setSelectedChapterIds}
          disabled={busy}
          resetKey={pickerResetKey}
        />
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
