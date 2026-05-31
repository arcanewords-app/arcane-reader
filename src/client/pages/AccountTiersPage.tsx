import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { useUserRole } from '../hooks/useUserRole';
import { RoleComparisonTable } from '../components/AccountTiers';
import { Button } from '../components/ui';
import { CONTACT_EMAIL } from '../../shared/contact';
import { authService } from '../services/authService';
import './InfoPages.css';
import '../components/AccountTiers/RoleComparisonTable.css';

export function AccountTiersPage() {
  const { t } = useTranslation();
  const { user, role, isAtLeast } = useUserRole();
  const isLoggedIn = !!user || authService.isAuthenticated();
  const isAuthor = isAtLeast('author');
  const canRequestUpgrade = isLoggedIn && !isAtLeast('admin');

  const handleRequestUpgrade = () => {
    const subject = encodeURIComponent(t('profile.upgradeMailSubject'));
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}`;
  };

  return (
    <div class="info-page info-page-wide">
      <div class="info-page-content">
        <button
          type="button"
          class="info-page-back"
          onClick={() => route(isLoggedIn ? '/catalog' : '/')}
          aria-label={t('common.back')}
        >
          ← {t('common.back')}
        </button>

        <h1 class="info-page-title">{t('tiers.pageTitle')}</h1>
        <p class="info-page-intro">{t('tiers.intro')}</p>

        <RoleComparisonTable currentRole={isLoggedIn ? role : undefined} />

        <p class="role-comparison-footnote">{t('tiers.tokenResetNote')}</p>

        <div class="account-tiers-actions">
          {canRequestUpgrade && !isAuthor && (
            <Button variant="primary" onClick={handleRequestUpgrade}>
              {t('tiers.requestUpgrade')}
            </Button>
          )}
          {isAuthor && (
            <Button variant="primary" onClick={() => route('/projects')}>
              {t('tiers.goToProjects')}
            </Button>
          )}
          {isLoggedIn && (
            <Button variant="secondary" onClick={() => route('/profile')}>
              {t('tiers.goToProfile')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
