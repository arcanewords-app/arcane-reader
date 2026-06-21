import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { Modal, Button } from '../ui';
import { CONTACT_EMAIL } from '../../../shared/contact';
import './CriticUpgradeModal.css';

interface CriticUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CriticUpgradeModal({ isOpen, onClose }: CriticUpgradeModalProps) {
  const { t } = useTranslation();

  const handleRequestUpgrade = () => {
    const subject = encodeURIComponent(t('critic.upgrade.mailSubject'));
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}`;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('critic.upgrade.title')} size="medium">
      <p class="critic-upgrade-message">{t('critic.upgrade.message')}</p>
      <div class="critic-upgrade-actions">
        <Button variant="primary" onClick={() => route('/account-tiers')}>
          {t('critic.upgrade.compareTiers')}
        </Button>
        <Button variant="secondary" onClick={handleRequestUpgrade}>
          {t('critic.upgrade.requestUpgrade')}
        </Button>
      </div>
    </Modal>
  );
}
