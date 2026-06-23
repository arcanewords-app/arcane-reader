import { useTranslation } from 'react-i18next';
import { Modal } from '../ui';
import { UpgradeRequestActions } from '../UpgradeRequest';
import { useUserRole } from '../../hooks/useUserRole';
import './AiReplaceUpgradeModal.css';

interface AiReplaceUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AiReplaceUpgradeModal({ isOpen, onClose }: AiReplaceUpgradeModalProps) {
  const { t } = useTranslation();
  const { user } = useUserRole();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('searchReplace.upgrade.title')} size="medium">
      <p class="ai-replace-upgrade-message">{t('searchReplace.upgrade.message')}</p>
      <UpgradeRequestActions
        mailSubject={t('searchReplace.upgrade.mailSubject')}
        userEmail={user?.email}
      />
    </Modal>
  );
}
