import { useTranslation } from 'react-i18next';
import { Modal } from '../ui';

interface GlossaryEditionStubProps {
  open: boolean;
  language: string;
  onClose: () => void;
}

/**
 * TODO(glossary-edition): replace with a glossary stored per target language.
 * Do not write analysis merges into glossary_entries for a non-primary target.
 */
export function GlossaryEditionStub({ open, language, onClose }: GlossaryEditionStubProps) {
  const { t } = useTranslation();
  const label = t(`language.${language}`) || language.toUpperCase();
  return (
    <Modal isOpen={open} onClose={onClose} title={t('edition.glossaryStubTitle')}>
      <p>{t('edition.glossaryStubBody', { language: label })}</p>
    </Modal>
  );
}
