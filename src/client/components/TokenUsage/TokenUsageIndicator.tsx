import { useState, useEffect } from 'preact/hooks';
import type { TokenUsage } from '../../types';
import { api } from '../../api/client';
import './TokenUsageIndicator.css';

interface TokenUsageIndicatorProps {
  className?: string;
  showDetails?: boolean;
}

export function TokenUsageIndicator({ className = '', showDetails = false }: TokenUsageIndicatorProps) {
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsage = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getTokenUsage();
      setUsage(data);
    } catch (err) {
      console.error('Failed to load token usage:', err);
      setError('Не удалось загрузить статистику');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsage();
    // Refresh every 30 seconds
    const interval = setInterval(loadUsage, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !usage) {
    return (
      <div class={`token-usage-indicator ${className}`}>
        <span class="token-usage-loading">Загрузка...</span>
      </div>
    );
  }

  if (error || !usage) {
    return null; // Don't show error, just hide the indicator
  }

  const percentage = usage.percentageUsed;
  const getColorClass = () => {
    if (percentage >= 95) return 'critical';
    if (percentage >= 80) return 'warning';
    if (percentage >= 50) return 'caution';
    return 'normal';
  };

  const colorClass = getColorClass();
  const progressWidth = Math.min(percentage, 100);

  return (
    <div class={`token-usage-indicator ${className}`} title={`Использовано токенов: ${usage.tokensUsed.toLocaleString()} / ${usage.tokensLimit.toLocaleString()}`}>
      <div class="token-usage-content">
        <div class="token-usage-label">
          <span class="token-usage-icon">📝</span>
          <span class="token-usage-text">
            {usage.tokensUsed.toLocaleString()} / {usage.tokensLimit.toLocaleString()}
          </span>
        </div>
        <div class={`token-usage-progress ${colorClass}`}>
          <div
            class="token-usage-progress-bar"
            style={{ width: `${progressWidth}%` }}
          />
        </div>
      </div>
      {showDetails && usage.tokensByStage && (
        <div class="token-usage-details">
          {usage.tokensByStage.analysis !== undefined && (
            <span class="token-usage-stage">
              Анализ: {usage.tokensByStage.analysis.toLocaleString()}
            </span>
          )}
          <span class="token-usage-stage">
            Перевод: {usage.tokensByStage.translation.toLocaleString()}
          </span>
          {usage.tokensByStage.editing !== undefined && (
            <span class="token-usage-stage">
              Редактура: {usage.tokensByStage.editing.toLocaleString()}
            </span>
          )}
        </div>
      )}
      {usage.warning && (
        <div class="token-usage-warning-badge">
          ⚠️ Приближение к лимиту
        </div>
      )}
    </div>
  );
}
