import { useCallback, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { Button } from '../ui';
import { CONTACT_EMAIL } from '../../../shared/contact';
import { openMailto } from '../../utils/openMailto';
import './UpgradeRequestActions.css';

export interface UpgradeRequestActionsProps {
  mailSubject: string;
  userEmail?: string | null;
  compareTiersLabel?: string;
  requestUpgradeLabel?: string;
  showCompareTiers?: boolean;
  className?: string;
}

export function UpgradeRequestActions({
  mailSubject,
  userEmail,
  compareTiersLabel,
  requestUpgradeLabel,
  showCompareTiers = true,
  className = '',
}: UpgradeRequestActionsProps) {
  const { t } = useTranslation();
  const [showFallback, setShowFallback] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleRequestUpgrade = useCallback(() => {
    const body = userEmail ? t('upgrade.mailBodyWithEmail', { email: userEmail }) : undefined;
    openMailto({ to: CONTACT_EMAIL, subject: mailSubject, body });
    setShowFallback(true);
    setCopied(false);
  }, [mailSubject, userEmail, t]);

  const handleCopyEmail = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, []);

  return (
    <div class={`upgrade-request-actions ${className}`.trim()}>
      <div class="upgrade-request-actions__buttons">
        {showCompareTiers && (
          <Button variant="primary" onClick={() => route('/account-tiers')}>
            {compareTiersLabel ?? t('upgrade.compareTiers')}
          </Button>
        )}
        <Button variant={showCompareTiers ? 'secondary' : 'primary'} onClick={handleRequestUpgrade}>
          {requestUpgradeLabel ?? t('upgrade.requestUpgrade')}
        </Button>
      </div>
      {showFallback && (
        <div class="upgrade-request-fallback" role="status">
          <p class="upgrade-request-fallback__hint">{t('upgrade.mailFallbackHint')}</p>
          <p class="upgrade-request-fallback__email">{CONTACT_EMAIL}</p>
          <div class="upgrade-request-fallback__links">
            <Button variant="secondary" size="sm" onClick={handleCopyEmail}>
              {copied ? t('upgrade.copyEmailDone') : t('upgrade.copyEmail')}
            </Button>
            <button
              type="button"
              class="upgrade-request-fallback__contact-link"
              onClick={() => route('/contact')}
            >
              {t('upgrade.contactPageLink')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
