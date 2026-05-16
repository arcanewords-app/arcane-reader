import { useTranslation } from 'react-i18next';
import { useServiceHealth } from '../contexts/ServiceHealthContext';
import { Button } from './ui';
import './ServiceStatusBanner.css';

export function ServiceStatusBanner() {
  const { t } = useTranslation();
  const { state, retry } = useServiceHealth();

  if (!state) return null;

  const isRecovered = state.status === 'recovered';
  const isDown = state.status === 'down';

  const variant = isRecovered ? 'recovered' : isDown ? 'down' : 'degraded';

  return (
    <div
      class={`service-status-banner service-status-banner--${variant}`}
      role="alert"
      aria-live="polite"
    >
      <div class="service-status-banner__content">
        <span class="service-status-banner__message">
          {isRecovered
            ? t('serviceHealth.recovered')
            : isDown
              ? t('serviceHealth.down')
              : t('serviceHealth.degraded')}
        </span>
        {!isRecovered && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => retry()}
            className="service-status-banner__retry"
          >
            {t('serviceHealth.retry')}
          </Button>
        )}
      </div>
    </div>
  );
}
