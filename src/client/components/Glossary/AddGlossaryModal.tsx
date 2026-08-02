import { useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { GlossaryEntryType } from '../../types.js';
import { Modal, Button, Input, Select } from '../ui/index.js';
import { api } from '../../api/client.js';

export interface AddGlossaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onAdd: () => void;
}

export function AddGlossaryModal({ isOpen, onClose, projectId, onAdd }: AddGlossaryModalProps) {
  const { t } = useTranslation();
  const [type, setType] = useState<GlossaryEntryType>('character');
  const [original, setOriginal] = useState('');
  const [translated, setTranslated] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setType('character');
    setOriginal('');
    setTranslated('');
    setDescription('');
    setNotes('');
  };

  const handleSave = async () => {
    if (!original.trim()) return;
    setSaving(true);
    try {
      await api.addGlossary(projectId, {
        type,
        original: original.trim(),
        translated: translated.trim(),
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      reset();
      onClose();
      onAdd();
    } finally {
      setSaving(false);
    }
  };

  const descriptionPlaceholder =
    type === 'character'
      ? t('glossary.descriptionPlaceholderChar')
      : type === 'location'
        ? t('glossary.descriptionPlaceholderLoc')
        : t('glossary.descriptionPlaceholderTerm');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('glossary.newEntryTitle')}
      className="nested"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {t('glossary.addButton')}
          </Button>
        </>
      }
    >
      <Select
        label={t('glossary.typeLabel')}
        value={type}
        onChange={(e) => setType((e.target as HTMLSelectElement).value as GlossaryEntryType)}
        options={[
          { value: 'character', label: t('glossary.characters') },
          { value: 'location', label: t('glossary.locations') },
          { value: 'term', label: t('glossary.terms') },
        ]}
      />
      <Input
        label={t('glossary.originalLabel')}
        placeholder={t('glossary.originalPlaceholder')}
        value={original}
        onInput={(e) => setOriginal((e.target as HTMLInputElement).value)}
      />
      <Input
        label={t('glossary.translatedLabel')}
        placeholder={t('glossary.translatedPlaceholder')}
        value={translated}
        onInput={(e) => setTranslated((e.target as HTMLInputElement).value)}
      />
      <div class="form-group">
        <label class="form-label">{t('glossary.descriptionOptionalLabel')}</label>
        <textarea
          class="form-input"
          style={{
            minHeight: '80px',
            resize: 'vertical',
            fontFamily: 'var(--font-display)',
          }}
          placeholder={descriptionPlaceholder}
          value={description}
          onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
        />
      </div>
      <Input
        label={t('glossary.notesLabel')}
        placeholder={t('glossary.notesPlaceholder')}
        value={notes}
        onInput={(e) => setNotes((e.target as HTMLInputElement).value)}
      />
    </Modal>
  );
}
