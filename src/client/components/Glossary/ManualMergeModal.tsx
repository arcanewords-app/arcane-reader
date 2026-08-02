import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { GlossaryEntry } from '../../types.js';
import { Modal, Button } from '../ui/index.js';
import { api } from '../../api/client.js';
import { GlossaryEntrySelect } from './GlossaryEntrySelect.js';

export interface ManualMergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  entries: GlossaryEntry[];
  onSuccess: () => void;
  onError: (title: string, message: string) => void;
}

export function ManualMergeModal({
  isOpen,
  onClose,
  projectId,
  entries,
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
