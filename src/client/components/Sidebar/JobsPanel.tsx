import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Button, Icon } from '../ui';
import { api } from '../../api/client';
import type { Project, ProjectWithChapterList, ProjectJobItem } from '../../types';
import './JobsPanel.css';

const JOBS_POLL_INTERVAL_MS = 30000; // 30 s when active jobs or expecting new job after trigger
const EXPECTING_JOBS_MS = 90000; // Poll for 90 s after batch start to catch job when it appears

interface JobsPanelProps {
  project: Project | ProjectWithChapterList;
  onRefreshProject?: () => Promise<void>;
  /** Increment to trigger immediate fetch (e.g. when user starts a batch) */
  triggerFetch?: number;
}

function jobStatusLabel(status: string, t: (key: string) => string): string {
  switch (status) {
    case 'queued':
      return t('jobsPanel.queued');
    case 'processing':
      return t('jobsPanel.processing');
    case 'completed':
      return t('jobsPanel.completed');
    case 'error':
      return t('jobsPanel.error');
    case 'canceled':
      return t('jobsPanel.canceled');
    default:
      return status;
  }
}

function jobTypeLabel(type: 'analysis' | 'translate', t: (key: string) => string): string {
  return type === 'analysis' ? t('jobsPanel.analysis') : t('jobsPanel.translation');
}

export function JobsPanel({ project, onRefreshProject, triggerFetch }: JobsPanelProps) {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<ProjectJobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const prevJobsRef = useRef<ProjectJobItem[]>([]);
  const onRefreshRef = useRef(onRefreshProject);
  onRefreshRef.current = onRefreshProject;
  const [isVisible, setIsVisible] = useState(
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  );
  const [expectingJobsUntil, setExpectingJobsUntil] = useState(0);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await api.getProjectJobs(project.id);
      const newJobs = res.jobs;
      const prevJobs = prevJobsRef.current;

      const jobJustFinished =
        newJobs.some((job) => {
          const prev = prevJobs.find((p) => p.jobId === job.jobId && p.type === job.type);
          const wasActive = prev?.status === 'queued' || prev?.status === 'processing';
          const isTerminal = job.status === 'completed' || job.status === 'error';
          return wasActive && isTerminal;
        }) ||
        prevJobs.some((prev) => {
          const wasActive = prev.status === 'queued' || prev.status === 'processing';
          if (!wasActive) return false;
          const inNew = newJobs.find((n) => n.jobId === prev.jobId && n.type === prev.type);
          return !inNew; // Job was active, now gone = completed and removed from index
        });

      if (jobJustFinished && onRefreshRef.current) {
        void onRefreshRef.current();
      }

      prevJobsRef.current = newJobs;
      setJobs(newJobs);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  const handleCancel = useCallback(
    async (job: ProjectJobItem) => {
      setCancelling(job.jobId);
      try {
        if (job.type === 'analysis') {
          await api.cancelAnalysisJob(project.id, job.jobId);
        } else {
          await api.cancelTranslateJob(project.id, job.jobId);
        }
        await fetchJobs();
        await onRefreshRef.current?.();
      } finally {
        setCancelling(null);
      }
    },
    [project.id, fetchJobs]
  );

  const activeCount = jobs.filter((j) => j.status === 'queued' || j.status === 'processing').length;

  useEffect(() => {
    const handler = () => {
      const visible = document.visibilityState === 'visible';
      setIsVisible(visible);
      if (visible) fetchJobs();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [fetchJobs]);

  useEffect(() => {
    if (triggerFetch != null && triggerFetch > 0) {
      fetchJobs();
      setExpectingJobsUntil(Date.now() + EXPECTING_JOBS_MS);
    }
  }, [triggerFetch, fetchJobs]);

  useEffect(() => {
    if (expectingJobsUntil <= 0) return;
    const remaining = expectingJobsUntil - Date.now();
    if (remaining <= 0) {
      setExpectingJobsUntil(0);
      return;
    }
    const t = setTimeout(() => setExpectingJobsUntil(0), remaining);
    return () => clearTimeout(t);
  }, [expectingJobsUntil]);

  const shouldPoll =
    activeCount > 0 || (expectingJobsUntil > 0 && Date.now() < expectingJobsUntil);

  useEffect(() => {
    fetchJobs();
    if (!isVisible || !shouldPoll) return;
    const interval = setInterval(fetchJobs, JOBS_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shouldPoll derived from activeCount, expectingJobsUntil
  }, [fetchJobs, isVisible, activeCount, expectingJobsUntil]);

  const isExpecting = expectingJobsUntil > 0 && Date.now() < expectingJobsUntil;
  if (jobs.length === 0 && !loading && !isExpecting) {
    return null;
  }

  return (
    <div class="jobs-panel">
      <div class="jobs-panel-header">
        <Icon name="pending_actions" size="sm" />
        <span class="jobs-panel-title">
          {t('jobsPanel.title')}
          {activeCount > 0 && <span class="jobs-panel-badge">{activeCount}</span>}
        </span>
      </div>
      {loading || (isExpecting && jobs.length === 0) ? (
        <div class="jobs-panel-loading">{t('common.loading')}</div>
      ) : (
        <ul class="jobs-panel-list">
          {jobs.map((job) => {
            const canCancel =
              (job.status === 'queued' || job.status === 'processing') && cancelling !== job.jobId;
            const statusClass =
              job.status === 'error'
                ? 'error'
                : job.status === 'completed'
                  ? 'completed'
                  : job.status === 'canceled'
                    ? 'canceled'
                    : 'active';
            return (
              <li
                key={`${job.type}-${job.jobId}`}
                class={`jobs-panel-item jobs-panel-item--${statusClass}`}
              >
                <div class="jobs-panel-item-header">
                  <span class="jobs-panel-item-type">{jobTypeLabel(job.type, t)}</span>
                  <span class={`jobs-panel-item-status jobs-panel-item-status--${job.status}`}>
                    {jobStatusLabel(job.status, t)}
                  </span>
                </div>
                <div class="jobs-panel-item-progress">
                  {job.current} / {job.total}
                  {job.currentChapterTitle && (
                    <span class="jobs-panel-item-chapter" title={job.currentChapterTitle}>
                      · {job.currentChapterTitle}
                    </span>
                  )}
                </div>
                {job.totalTokensUsed > 0 && (
                  <div class="jobs-panel-item-tokens">
                    {job.totalTokensUsed.toLocaleString()} {t('projectInfo.tokensCount')}
                  </div>
                )}
                {canCancel && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="jobs-panel-item-cancel"
                    onClick={() => handleCancel(job)}
                    disabled={cancelling === job.jobId}
                  >
                    {t('jobsPanel.cancel')}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
