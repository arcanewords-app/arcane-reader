import { useState, useRef } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Modal, Button, Icon } from '../ui';
import { ApiError } from '../../api/client';
import './UploadTranslationModal.css';

interface UploadTranslationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (translatedText: string) => Promise<void>;
  chapterTitle?: string;
}

export function UploadTranslationModal({
  isOpen,
  onClose,
  onSubmit,
  chapterTitle,
}: UploadTranslationModalProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError(t('uploadTranslation.emptyError', 'Введите текст перевода'));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onSubmit(trimmed);
      setText('');
      onClose();
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      const msg =
        apiErr?.data && typeof apiErr.data === 'object' && 'message' in apiErr.data
          ? String((apiErr.data as { message?: string }).message)
          : e instanceof Error
            ? e.message
            : String(e);
      setError(msg || t('uploadTranslation.submitError', 'Ошибка загрузки'));
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result || ''));
      setError(null);
    };
    reader.readAsText(file, 'UTF-8');
    input.value = '';
  };

  const handleClose = () => {
    if (!loading) {
      setText('');
      setError(null);
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('uploadTranslation.title', 'Загрузить готовый перевод')}
      size="large"
      footer={
        <div class="upload-translation-modal-footer">
          <Button variant="secondary" onClick={handleClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={loading || !text.trim()}>
            {loading ? <span class="spinner" /> : null}
            {loading
              ? t('uploadTranslation.uploading', 'Загрузка…')
              : t('uploadTranslation.upload', 'Загрузить')}
          </Button>
        </div>
      }
    >
      <div class="upload-translation-modal">
        {chapterTitle && <p class="upload-translation-modal-chapter">{chapterTitle}</p>}
        <p class="upload-translation-modal-hint">
          {t(
            'uploadTranslation.hint',
            'Вставьте или загрузите текст перевода. Текст будет разбит по абзацам (двойной перенос строки).'
          )}
        </p>
        <textarea
          class="upload-translation-modal-textarea"
          placeholder={t('uploadTranslation.placeholder', 'Вставьте текст перевода…')}
          value={text}
          onInput={(e) => {
            setText((e.target as HTMLTextAreaElement).value);
            setError(null);
          }}
          rows={12}
          disabled={loading}
        />
        <div class="upload-translation-modal-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
          >
            <Icon name="upload_file" size="sm" />{' '}
            {t('uploadTranslation.chooseFile', 'Выбрать файл TXT')}
          </Button>
        </div>
        {error && <p class="upload-translation-modal-error">{error}</p>}
      </div>
    </Modal>
  );
}
