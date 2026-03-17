import { useEffect, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { Modal, Button, LoadingSpinner, Icon } from '../ui';
import { api } from '../../api/client';
import './ReportsModal.css';

export interface TranslationReport {
  id: string;
  publicationId: string;
  chapterId: string;
  chapterNumber?: number;
  chapterTitle?: string;
  description: string;
  reporterUserId: string | null;
  status: string;
  createdAt: string;
}

interface ReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export function ReportsModal({ isOpen, onClose, projectId }: ReportsModalProps) {
  const { t } = useTranslation();
  const [reports, setReports] = useState<TranslationReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !projectId) return;
    setLoading(true);
    setError(null);
    api
      .getProjectReports(projectId)
      .then(setReports)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.retry')))
      .finally(() => setLoading(false));
  }, [isOpen, projectId, t]);

  const handleGoToChapter = (chapterId: string) => {
    onClose();
    route(`/projects/${projectId}/chapters/${chapterId}`);
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('sidebar.reports')}
      size="large"
      className="reports-modal"
    >
      {loading ? (
        <div class="reports-modal-loading">
          <LoadingSpinner size="lg" />
        </div>
      ) : error ? (
        <p class="reports-modal-error">{error}</p>
      ) : reports.length === 0 ? (
        <p class="reports-modal-empty">{t('sidebar.reportsEmpty')}</p>
      ) : (
        <div class="reports-modal-list">
          {reports.map((r) => (
            <div key={r.id} class="reports-modal-item">
              <div class="reports-modal-item-header">
                <span class="reports-modal-item-chapter">
                  {r.chapterTitle || t('readingMode.chapterFallback', { n: r.chapterNumber ?? 0 })}
                </span>
                <span class="reports-modal-item-date">{formatDate(r.createdAt)}</span>
                <span class={`reports-modal-item-status reports-modal-status-${r.status}`}>
                  {r.status}
                </span>
              </div>
              <p class="reports-modal-item-description">{r.description}</p>
              <Button variant="secondary" size="sm" onClick={() => handleGoToChapter(r.chapterId)}>
                <Icon name="arrow_forward" size="sm" /> {t('sidebar.reportsGoToChapter')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
