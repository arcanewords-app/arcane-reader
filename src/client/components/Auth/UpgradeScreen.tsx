/**
 * Shown when a registered user (role: user) tries to access author-only features
 * (cabinet, projects). Prompts to upgrade to author subscription.
 */

import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { Button } from '../ui';
import { CONTACT_EMAIL } from '../../../shared/contact';
import './UpgradeScreen.css';

export function UpgradeScreen() {
  const { t } = useTranslation();

  const handleGoToCatalog = () => {
    route('/');
  };

  const handleGoToProfile = () => {
    route('/profile');
  };

  const handleRequestUpgrade = () => {
    const subject = encodeURIComponent(t('auth.upgradeMailSubject'));
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}`;
  };

  return (
    <div class="upgrade-screen">
      <div class="upgrade-screen__content">
        <h1 class="upgrade-screen__title">{t('auth.upgradeTitle')}</h1>
        <p class="upgrade-screen__message">{t('auth.upgradeMessage')}</p>
        <div class="upgrade-screen__actions">
          <Button variant="primary" onClick={handleGoToCatalog}>
            {t('auth.upgradeGoToCatalog')}
          </Button>
          <Button variant="secondary" onClick={handleGoToProfile}>
            {t('auth.upgradeGoToProfile')}
          </Button>
          <Button variant="secondary" onClick={handleRequestUpgrade}>
            {t('auth.requestUpgrade')}
          </Button>
        </div>
      </div>
    </div>
  );
}
