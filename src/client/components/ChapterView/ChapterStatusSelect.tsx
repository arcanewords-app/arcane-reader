import { useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { Chapter, ChapterStatus } from '../../types';
import { Modal, StatusBadge, Icon } from '../ui';
import { api } from '../../api/client';
import './ChapterStatusSelect.css';

/** Statuses user can set manually (error/analyzed are system-set, not shown) */
const MANUAL_STATUSES: ChapterStatus[] = ['pending', 'draft', 'completed'];

interface ChapterStatusSelectProps {
  chapter: Chapter;
  projectId: string;
  onChapterUpdate: (chapter: Chapter) => void;
}

export function ChapterStatusSelect({
  chapter,
  projectId,
  onChapterUpdate,
}: ChapterStatusSelectProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const currentStatus = chapter.status;

  if (currentStatus === 'translating') {
    return (
      <StatusBadge
        status={currentStatus}
        showText={currentStatus !== 'completed'}
      />
    );
  }

  const handleSelect = async (status: ChapterStatus) => {
    if (status === currentStatus) {
      setIsOpen(false);
      return;
    }

    setSaving(true);
    try {
      const updated = await api.updateChapterStatus(projectId, chapter.id, status);
      onChapterUpdate(updated);
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to update chapter status:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        class="chapter-status-select-trigger"
        onClick={() => setIsOpen(true)}
        title={t('chapter.changeStatus', 'Change status')}
        aria-label={t('chapter.changeStatus', 'Change status')}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <StatusBadge status={currentStatus} showText={currentStatus !== 'completed'} />
        <Icon name="arrow_drop_down" size="sm" className="chapter-status-select-chevron" />
      </button>

      <Modal
        isOpen={isOpen}
        onClose={() => !saving && setIsOpen(false)}
        title={t('chapter.changeStatusTitle', 'Change chapter status')}
      >
        <div class="chapter-status-select-list">
          {MANUAL_STATUSES.map((status) => {
            const isCurrent = status === currentStatus;
            return (
              <button
                key={status}
                type="button"
                class={`chapter-status-select-option ${isCurrent ? 'is-current' : ''}`}
                onClick={() => handleSelect(status)}
                disabled={saving}
              >
                <StatusBadge status={status} showText={true} />
                {isCurrent && <Icon name="check" size="sm" className="chapter-status-select-check" />}
              </button>
            );
          })}
        </div>
      </Modal>
    </>
  );
}
