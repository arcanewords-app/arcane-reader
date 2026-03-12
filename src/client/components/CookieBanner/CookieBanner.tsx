import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { useCookieConsent } from '../../contexts/CookieConsentContext';
import { Button } from '../ui';
import './CookieBanner.css';

export function CookieBanner() {
  const { t } = useTranslation();
  const { hasDecided, acceptConsent, rejectConsent } = useCookieConsent();

  if (hasDecided) return null;

  return (
    <div class="cookie-banner" role="dialog" aria-labelledby="cookie-banner-title">
      <div class="cookie-banner__content">
        <div class="cookie-banner__text">
          <h2 id="cookie-banner-title" class="cookie-banner__title">
            {t('cookieBanner.title')}
          </h2>
          <p class="cookie-banner__description">
            {t('cookieBanner.description')}{' '}
            <a
              href="/privacy"
              class="cookie-banner__link"
              onClick={(e) => {
                e.preventDefault();
                route('/privacy');
              }}
            >
              {t('cookieBanner.privacyLink')}
            </a>
          </p>
        </div>
        <div class="cookie-banner__actions">
          <Button variant="secondary" size="sm" onClick={rejectConsent}>
            {t('cookieBanner.reject')}
          </Button>
          <Button variant="primary" size="sm" onClick={acceptConsent}>
            {t('cookieBanner.accept')}
          </Button>
        </div>
      </div>
    </div>
  );
}
