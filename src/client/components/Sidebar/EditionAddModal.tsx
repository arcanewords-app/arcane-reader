import { useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from '../ui';
import { isValidLanguagePair } from '../../constants/translationLanguages';
import { api } from '../../api/client';

interface EditionAddModalProps {
  isOpen: boolean;
  projectId: string;
  sourceLanguage: string;
  primaryLanguage: string;
  onClose: () => void;
  onCreated: (targetLanguage: string) => void;
}

/** Adds the one remaining target. Chapters and glossary are not copied. */
export function EditionAddModal({
  isOpen,
  projectId,
  sourceLanguage,
  primaryLanguage,
  onClose,
  onCreated,
}: EditionAddModalProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const candidate = primaryLanguage === 'ru' ? 'be' : 'ru';
  const allowed = isValidLanguagePair(sourceLanguage, candidate);
  const label = t(`language.${candidate}`) || candidate.toUpperCase();
  const inKey = `languageIn.${candidate}`;
  const translatedIn = t(inKey);
  const languageIn = translatedIn === inKey ? label : translatedIn;

  const handleCreate = async () => {
    if (!allowed || saving) return;
    setSaving(true);
    try {
      await api.createProjectEdition(projectId, candidate);
      onCreated(candidate);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('edition.addTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleCreate()}
            disabled={!allowed || saving}
          >
            {t('edition.addConfirm', { language: label })}
          </Button>
        </>
      }
    >
      <p>
        {allowed ? t('edition.addBody', { language: languageIn }) : t('edition.analysisLocked')}
      </p>
    </Modal>
  );
}
