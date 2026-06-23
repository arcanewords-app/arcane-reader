import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { useUserRole } from '../hooks/useUserRole';
import { RoleComparisonTable } from '../components/AccountTiers';
import { UpgradeRequestActions } from '../components/UpgradeRequest';
import { Button } from '../components/ui';
import { authService } from '../services/authService';
import './InfoPages.css';
import '../components/AccountTiers/RoleComparisonTable.css';

export function AccountTiersPage() {
  const { t } = useTranslation();
  const { user, role, isAtLeast } = useUserRole();
  const isLoggedIn = !!user || authService.isAuthenticated();
  const isAuthor = isAtLeast('author');
  const canRequestUpgrade = isLoggedIn && !isAtLeast('admin');

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
            <UpgradeRequestActions
              showCompareTiers={false}
              mailSubject={t('profile.upgradeMailSubject')}
              userEmail={user?.email}
              requestUpgradeLabel={t('tiers.requestUpgrade')}
            />
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
