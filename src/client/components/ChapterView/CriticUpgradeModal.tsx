import { useTranslation } from 'react-i18next';
import { Modal } from '../ui';
import { UpgradeRequestActions } from '../UpgradeRequest';
import { useUserRole } from '../../hooks/useUserRole';
import './CriticUpgradeModal.css';

interface CriticUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CriticUpgradeModal({ isOpen, onClose }: CriticUpgradeModalProps) {
  const { t } = useTranslation();
  const { user } = useUserRole();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('critic.upgrade.title')} size="medium">
      <p class="critic-upgrade-message">{t('critic.upgrade.message')}</p>
      <UpgradeRequestActions
        mailSubject={t('critic.upgrade.mailSubject')}
        userEmail={user?.email}
        compareTiersLabel={t('critic.upgrade.compareTiers')}
        requestUpgradeLabel={t('critic.upgrade.requestUpgrade')}
      />
    </Modal>
  );
}
