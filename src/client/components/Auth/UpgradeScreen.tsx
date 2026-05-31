/**
 * Shown when a registered user (role: user) tries to access author-only features
 * (cabinet, projects). Prompts to upgrade to author subscription.
 */

import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { Button } from '../ui';
import { RoleComparisonTable } from '../AccountTiers';
import { useUserRole } from '../../hooks/useUserRole';
import { CONTACT_EMAIL } from '../../../shared/contact';
import './UpgradeScreen.css';
import '../AccountTiers/RoleComparisonTable.css';

export function UpgradeScreen() {
  const { t } = useTranslation();
  const { role } = useUserRole();

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

  const handleLearnMore = () => {
    route('/account-tiers');
  };

  return (
    <div class="upgrade-screen">
      <div class="upgrade-screen__content upgrade-screen__content-wide">
        <h1 class="upgrade-screen__title">{t('auth.upgradeTitle')}</h1>
        <p class="upgrade-screen__message">{t('auth.upgradeMessage')}</p>

        <RoleComparisonTable currentRole={role} compact />

        <p class="role-comparison-footnote">{t('tiers.tokenResetNote')}</p>

        <div class="upgrade-screen__actions">
          <Button variant="primary" onClick={handleRequestUpgrade}>
            {t('auth.requestUpgrade')}
          </Button>
          <Button variant="secondary" onClick={handleLearnMore}>
            {t('auth.upgradeLearnMore')}
          </Button>
          <Button variant="secondary" onClick={handleGoToCatalog}>
            {t('auth.upgradeGoToCatalog')}
          </Button>
          <Button variant="secondary" onClick={handleGoToProfile}>
            {t('auth.upgradeGoToProfile')}
          </Button>
        </div>
      </div>
    </div>
  );
}
