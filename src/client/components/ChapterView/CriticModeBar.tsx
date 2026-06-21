import { useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { ChapterCriticReport } from '../../types';
import { Button, Icon } from '../ui';
import './CriticModeBar.css';

interface CriticModeBarProps {
  report: ChapterCriticReport | null;
  loading: boolean;
  isStale: boolean;
  generalIssuesCount: number;
  onExit: () => void;
  onRerun: () => void;
}

export function CriticModeBar({
  report,
  loading,
  isStale,
  generalIssuesCount,
  onExit,
  onRerun,
}: CriticModeBarProps) {
  const { t } = useTranslation();
  const [summaryOpen, setSummaryOpen] = useState(true);

  return (
    <div class="critic-mode-bar">
      <div class="critic-mode-bar-top">
        <div class="critic-mode-bar-title-row">
          <Icon name="rate_review" size="sm" />
          <span class="critic-mode-bar-title">{t('critic.modeTitle')}</span>
          <span class="critic-mode-bar-badge">{t('critic.experimental')}</span>
        </div>
        <div class="critic-mode-bar-actions">
          <Button variant="secondary" size="sm" onClick={onRerun} disabled={loading}>
            <Icon name="refresh" size="sm" /> {t('critic.rerun')}
          </Button>
          <Button variant="secondary" size="sm" onClick={onExit} disabled={loading}>
            <Icon name="close" size="sm" /> {t('critic.exit')}
          </Button>
        </div>
      </div>

      {isStale && (
        <div class="critic-mode-bar-stale" role="status">
          {t('critic.staleBanner')}
        </div>
      )}

      {loading && (
        <div class="critic-mode-bar-loading">
          <span class="spinner" />
          {t('critic.loading')}
        </div>
      )}

      {report && !loading && (
        <>
          <button
            type="button"
            class="critic-mode-bar-summary-toggle"
            onClick={() => setSummaryOpen((v) => !v)}
            aria-expanded={summaryOpen}
          >
            <Icon name={summaryOpen ? 'expand_less' : 'expand_more'} size="sm" />
            {t('critic.summaryToggle')}
          </button>
          {summaryOpen && (
            <div class="critic-mode-bar-summary">
              {report.strengths ? (
                <p>
                  <strong>{t('critic.strengthsLabel')}:</strong> {report.strengths}
                </p>
              ) : null}
              {report.summary ? <p>{report.summary}</p> : null}
              {generalIssuesCount > 0 ? (
                <p class="critic-mode-bar-general">
                  {t('critic.generalIssues', { count: generalIssuesCount })}
                </p>
              ) : null}
              <p class="critic-mode-bar-meta">
                {new Date(report.createdAt).toLocaleString()} · {report.model}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
