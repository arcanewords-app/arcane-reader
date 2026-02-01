import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { TokenUsage } from '../../types';
import { api } from '../../api/client';
import { authService } from '../../services/authService';
import './TokenUsageIndicator.css';

interface TokenUsageIndicatorProps {
  className?: string;
  showDetails?: boolean;
}

export function TokenUsageIndicator({ className = '', showDetails = false }: TokenUsageIndicatorProps) {
  const { t } = useTranslation();
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsage = async () => {
    // Check if user is authenticated before making request
    if (!authService.isAuthenticated()) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await api.getTokenUsage();
      setUsage(data);
    } catch (err: any) {
      // Don't show error for 401 (unauthorized) - user just needs to login
      if (err?.status === 401) {
        setLoading(false);
        return;
      }
      console.error('Failed to load token usage:', err);
      setError(t('tokenUsage.errorLoadStats'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only load if authenticated
    if (!authService.isAuthenticated()) {
      setLoading(false);
      return;
    }

    loadUsage();
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      // Re-check authentication before each refresh
      if (authService.isAuthenticated()) {
        loadUsage();
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  // Don't render if not authenticated or no usage data
  if (!authService.isAuthenticated()) {
    return null;
  }

  if (loading && !usage) {
    return (
      <div class={`token-usage-indicator ${className}`}>
        <span class="token-usage-loading">{t('tokenUsage.loading')}</span>
      </div>
    );
  }

  if (error || !usage) {
    return null; // Don't show error, just hide the indicator
  }

  const unlimited = usage.tokensLimit < 0;
  const percentage = usage.percentageUsed;
  const getColorClass = () => {
    if (percentage >= 95) return 'critical';
    if (percentage >= 80) return 'warning';
    if (percentage >= 50) return 'caution';
    return 'normal';
  };

  const colorClass = getColorClass();
  const progressWidth = unlimited ? 0 : Math.min(percentage, 100);

  return (
    <div
      class={`token-usage-indicator ${className} ${unlimited ? 'token-usage-unlimited' : ''}`}
      title={unlimited ? t('tokenUsage.unlimitedTitle', { used: usage.tokensUsed.toLocaleString() }) : t('tokenUsage.usedTokensTitle', { used: usage.tokensUsed.toLocaleString(), limit: usage.tokensLimit.toLocaleString() })}
    >
      <div class="token-usage-content">
        <div class="token-usage-label">
          <span class="token-usage-icon">📝</span>
          <span class="token-usage-text">
            {unlimited ? (
              <>
                {usage.tokensUsed.toLocaleString()} · {t('tokenUsage.unlimited')}
              </>
            ) : (
              <>
                {usage.tokensUsed.toLocaleString()} / {usage.tokensLimit.toLocaleString()}
              </>
            )}
          </span>
        </div>
        {!unlimited && (
          <div class={`token-usage-progress ${colorClass}`}>
            <div
              class="token-usage-progress-bar"
              style={{ width: `${progressWidth}%` }}
            />
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
      {!unlimited && usage.warning && (
        <div class="token-usage-warning-badge">
          ⚠️ {t('tokenUsage.approachingLimit')}
        </div>
      )}
    </div>
  );
}
