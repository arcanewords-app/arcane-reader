import { useTranslation } from 'react-i18next';
import { authService } from '../../services/authService';
import { useTokenUsageContext } from '../../contexts/TokenUsageContext';
import { getCreditDisplay } from '../../utils/creditDisplay';
import { Icon } from '../ui';
import '../../styles/components/card-content-popup.css';
import './TokenUsageIndicator.css';

interface TokenUsageIndicatorProps {
  className?: string;
  showDetails?: boolean;
}

export function TokenUsageIndicator({
  className = '',
  showDetails = false,
}: TokenUsageIndicatorProps) {
  const { t } = useTranslation();
  const { usage, loading, error } = useTokenUsageContext();

  // Don't render if not authenticated or no usage data
  if (!authService.isAuthenticated()) {
    return null;
  }

  if (loading && !usage) {
    return (
      <div class={`token-usage-indicator ${className}`} data-testid="token-usage">
        <span class="token-usage-loading">{t('tokenUsage.loading')}</span>
      </div>
    );
  }

  if (error || !usage) {
    return null;
  }

  const credits = getCreditDisplay(usage);
  const progressWidth = credits.unlimited
    ? 0
    : Math.min(Math.max(credits.remainingPercent, 0), 100);
  const hint = credits.unlimited
    ? t('tokenUsage.unlimitedTitle')
    : t('tokenUsage.remainingCreditsTitle', {
        remaining: credits.remaining.toLocaleString(),
        limit: credits.limit.toLocaleString(),
      });

  return (
    <div
      class={`token-usage-indicator ${className} ${credits.unlimited ? 'token-usage-unlimited' : ''}`}
      data-testid="token-usage"
    >
      <span class="token-usage-sr-only">{hint}</span>
      <div class="token-usage-content" aria-hidden="true">
        <div class="token-usage-label">
          <span class="token-usage-icon">
            <Icon name="toll" size="sm" />
          </span>
          <span class="token-usage-text">
            {credits.unlimited ? t('tokenUsage.unlimited') : credits.remaining.toLocaleString()}
          </span>
        </div>
        {!credits.unlimited && (
          <div class={`token-usage-progress ${credits.colorClass}`}>
            <div class="token-usage-progress-bar" style={{ width: `${progressWidth}%` }} />
          </div>
        )}
      </div>
      {showDetails && usage.tokensByStage && (
        <div class="token-usage-details">
          {usage.tokensByStage.analysis !== undefined && (
            <span class="token-usage-stage">
              {t('tokenUsage.analysis')} {usage.tokensByStage.analysis.toLocaleString()}
            </span>
          )}
          <span class="token-usage-stage">
            {t('tokenUsage.translation')} {usage.tokensByStage.translation.toLocaleString()}
          </span>
          {usage.tokensByStage.editing !== undefined && (
            <span class="token-usage-stage">
              {t('tokenUsage.editing')} {usage.tokensByStage.editing.toLocaleString()}
            </span>
          )}
        </div>
      )}
      {showDetails && !credits.unlimited && usage.warning && (
        <div class="token-usage-warning-badge">
          <Icon name="warning" size="sm" /> {t('tokenUsage.approachingLimit')}
        </div>
      )}
      <div
        class="token-usage-tooltip card-content-popup card-content-popup--below card-content-popup--align-end"
        role="tooltip"
        aria-hidden="true"
      >
        {hint}
      </div>
    </div>
  );
}
