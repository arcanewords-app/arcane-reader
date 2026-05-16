import { useEffect, useState, useCallback } from 'preact/hooks';
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

type ReportStatusFilter = 'all' | 'pending' | 'reviewed' | 'resolved';

interface ReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  /** Called after status update or delete so parent can refresh reports count */
  onReportsChange?: () => void;
}

export function ReportsModal({ isOpen, onClose, projectId, onReportsChange }: ReportsModalProps) {
  const { t } = useTranslation();
  const [reports, setReports] = useState<TranslationReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReportStatusFilter>('pending');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const fetchReports = useCallback(() => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    api
      .getProjectReports(projectId)
      .then(setReports)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.retry')))
      .finally(() => setLoading(false));
  }, [projectId, t]);

  useEffect(() => {
    if (!isOpen || !projectId) return;
    fetchReports();
  }, [isOpen, projectId, fetchReports]);

  const handleGoToChapter = (chapterId: string, description?: string) => {
    onClose();
    const searchQuery = description?.trim().slice(0, 60) ?? '';
    const searchParam = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : '';
    route(`/projects/${projectId}/chapters/${chapterId}${searchParam}`);
  };

  const handleUpdateStatus = async (reportId: string, status: 'reviewed' | 'resolved') => {
    setActionLoading(reportId);
    try {
      await api.updateReportStatus(projectId, reportId, status);
      setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, status } : r)));
      onReportsChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.retry'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (reportId: string) => {
    setActionLoading(reportId);
    try {
      await api.deleteReport(projectId, reportId);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      setDeleteConfirmId(null);
      onReportsChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.retry'));
    } finally {
      setActionLoading(null);
    }
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

  const getStatusLabel = (status: string) => {
    const key = `sidebar.reportStatus.${status}`;
    const translated = t(key);
    return translated !== key ? translated : status;
  };

  const filteredReports =
    statusFilter === 'all' ? reports : reports.filter((r) => r.status === statusFilter);

  const filterTabs: { value: ReportStatusFilter; labelKey: string; icon: string }[] = [
    { value: 'all', labelKey: 'sidebar.reportFilterAll', icon: 'grid_view' },
    { value: 'pending', labelKey: 'sidebar.reportFilterPending', icon: 'flag' },
    { value: 'reviewed', labelKey: 'sidebar.reportFilterReviewed', icon: 'schedule' },
    { value: 'resolved', labelKey: 'sidebar.reportFilterResolved', icon: 'check_circle' },
  ];

  const statusIcons: Record<string, string> = {
    pending: 'flag',
    reviewed: 'schedule',
    resolved: 'check_circle',
  };

  return (
    <>
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
          <>
            <p class="reports-modal-hint">{t('sidebar.reportsHint')}</p>
            <div class="reports-modal-filters">
              {filterTabs.map(({ value, labelKey, icon }) => (
                <button
                  key={value}
                  type="button"
                  class={`reports-modal-filter-tab ${statusFilter === value ? 'active' : ''}`}
                  onClick={() => setStatusFilter(value)}
                >
                  <Icon name={icon} size="sm" /> {t(labelKey)}
                </button>
              ))}
            </div>
            <div class="reports-modal-list">
              {filteredReports.map((r) => (
                <div key={r.id} class="reports-modal-item">
                  <div class="reports-modal-item-header">
                    <span class="reports-modal-item-chapter">
                      {r.chapterTitle ||
                        t('readingMode.chapterFallback', { n: r.chapterNumber ?? 0 })}
                    </span>
                    <span class="reports-modal-item-date">{formatDate(r.createdAt)}</span>
                    <span class={`reports-modal-item-status reports-modal-status-${r.status}`}>
                      <Icon name={statusIcons[r.status] ?? 'flag'} size="sm" />{' '}
                      {getStatusLabel(r.status)}
                    </span>
                  </div>
                  <p class="reports-modal-item-description">{r.description}</p>
                  <div class="reports-modal-item-actions">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleGoToChapter(r.chapterId, r.description)}
                    >
                      <Icon name="arrow_forward" size="sm" /> {t('sidebar.reportsGoToChapter')}
                    </Button>
                    <div class="reports-modal-status-actions">
                      {r.status !== 'reviewed' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleUpdateStatus(r.id, 'reviewed')}
                          disabled={actionLoading === r.id}
                          title={t('sidebar.reportMarkReviewedTitle')}
                          aria-label={t('sidebar.reportMarkReviewedTitle')}
                        >
                          {actionLoading === r.id ? (
                            <LoadingSpinner size="sm" />
                          ) : (
                            t('sidebar.reportMarkReviewed')
                          )}
                        </Button>
                      )}
                      {r.status !== 'resolved' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleUpdateStatus(r.id, 'resolved')}
                          disabled={actionLoading === r.id}
                          title={t('sidebar.reportMarkResolvedTitle')}
                          aria-label={t('sidebar.reportMarkResolvedTitle')}
                        >
                          {actionLoading === r.id ? (
                            <LoadingSpinner size="sm" />
                          ) : (
                            t('sidebar.reportMarkResolved')
                          )}
                        </Button>
                      )}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setDeleteConfirmId(r.id)}
                      disabled={actionLoading === r.id}
                      title={t('sidebar.reportDelete')}
                      aria-label={t('sidebar.reportDelete')}
                      className="reports-modal-delete-btn"
                    >
                      <Icon name="delete" size="sm" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {filteredReports.length === 0 && statusFilter !== 'all' && (
              <p class="reports-modal-empty">{t('sidebar.reportsEmpty')}</p>
            )}
          </>
        )}
      </Modal>

      <Modal
        isOpen={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        title={t('sidebar.reportDeleteConfirmTitle')}
        variant="error"
        className="reports-modal-confirm"
        closeButtonDisabled={actionLoading !== null}
        footer={
          <div class="reports-modal-confirm-actions">
            <Button
              variant="secondary"
              onClick={() => setDeleteConfirmId(null)}
              disabled={actionLoading !== null}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              disabled={actionLoading !== null}
            >
              {actionLoading === deleteConfirmId ? (
                <LoadingSpinner size="sm" />
              ) : (
                t('sidebar.reportDeleteConfirm')
              )}
            </Button>
          </div>
        }
      >
        <p class="reports-modal-confirm-body">{t('sidebar.reportDeleteConfirmBody')}</p>
      </Modal>
    </>
  );
}
