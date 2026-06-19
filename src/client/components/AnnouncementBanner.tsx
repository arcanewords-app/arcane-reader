import { useCallback, useEffect, useRef } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { useAnnouncement } from '../contexts/AnnouncementContext';
import { useServiceHealth } from '../contexts/ServiceHealthContext';
import {
  trackAnnouncementCtaClick,
  trackAnnouncementDismiss,
  trackAnnouncementView,
} from '../utils/analytics';
import { Icon } from './ui';
import './AnnouncementBanner.css';

export function AnnouncementBanner() {
  const { t } = useTranslation();
  const { state: healthState } = useServiceHealth();
  const { alert, dismiss } = useAnnouncement();
  const viewedKeyRef = useRef<string | null>(null);

  const handleDismiss = useCallback(
    (e: Event) => {
      e.stopPropagation();
      if (!alert) return;
      trackAnnouncementDismiss(alert);
      dismiss();
    },
    [alert, dismiss]
  );

  useEffect(() => {
    if (healthState || !alert) return;

    const viewKey = `${alert.id}:${alert.contentVersion}`;
    if (viewedKeyRef.current === viewKey) return;
    viewedKeyRef.current = viewKey;
    trackAnnouncementView(alert);
  }, [alert, healthState]);

  useEffect(() => {
    if (!alert?.dismissible) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleDismiss(e);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [alert?.dismissible, handleDismiss]);

  if (healthState || !alert) return null;

  const isExternalCta = Boolean(alert.ctaUrl?.startsWith('http'));

  const handleCta = (e: Event) => {
    e.preventDefault();
    if (!alert.ctaUrl) return;
    trackAnnouncementCtaClick({
      id: alert.id,
      variant: alert.variant,
      contentVersion: alert.contentVersion,
      ctaUrl: alert.ctaUrl,
    });
    if (isExternalCta) {
      window.open(alert.ctaUrl!, '_blank', 'noopener,noreferrer');
      return;
    }
    route(alert.ctaUrl);
  };

  return (
    <div
      class={`announcement-banner announcement-banner--${alert.variant}`}
      role="region"
      aria-labelledby="announcement-banner-message"
    >
      <div class="announcement-banner__content">
        {alert.ctaUrl ? (
          <a
            href={alert.ctaUrl}
            class="announcement-banner__link"
            onClick={handleCta}
            aria-label={t('announcement.openNews')}
            {...(isExternalCta ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            <span id="announcement-banner-message" class="announcement-banner__message">
              {alert.message}
            </span>
            <Icon name="chevron_right" size="sm" className="announcement-banner__arrow" />
          </a>
        ) : (
          <span id="announcement-banner-message" class="announcement-banner__message">
            {alert.message}
          </span>
        )}
        <div class="announcement-banner__actions">
          {alert.dismissible && (
            <button
              type="button"
              class="announcement-banner__dismiss"
              onClick={handleDismiss}
              aria-label={t('announcement.dismiss')}
            >
              <Icon name="close" size="sm" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
