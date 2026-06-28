import { useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../api/client';
import {
  PROJECT_DEFAULT_SOURCE_LANGUAGE,
  PROJECT_DEFAULT_TARGET_LANGUAGE,
  type ProjectSourceLanguage,
  type ProjectTargetLanguage,
} from '../../constants/translationLanguages';
import { ProjectLanguagePairFields } from '../Project/ProjectLanguagePairFields';
import { Button, Input, Modal } from '../ui';

export interface SuggestTranslationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function SuggestTranslationModal({
  isOpen,
  onClose,
  onSuccess,
}: SuggestTranslationModalProps) {
  const { t } = useTranslation();

  const [title, setTitle] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState<ProjectSourceLanguage>(
    PROJECT_DEFAULT_SOURCE_LANGUAGE
  );
  const [targetLanguage, setTargetLanguage] = useState<ProjectTargetLanguage>(
    PROJECT_DEFAULT_TARGET_LANGUAGE
  );
  const [comment, setComment] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const resetForm = () => {
    setTitle('');
    setAuthorName('');
    setSourceLanguage(PROJECT_DEFAULT_SOURCE_LANGUAGE);
    setTargetLanguage(PROJECT_DEFAULT_TARGET_LANGUAGE);
    setComment('');
    setSourceUrl('');
    setCreateError(null);
    setSuccess(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleCreate = async () => {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 2) {
      setCreateError(t('translationRequests.errors.titleRequired'));
      return;
    }
    const trimmedComment = comment.trim();
    if (trimmedComment.length > 0 && trimmedComment.length < 5) {
      setCreateError(t('translationRequests.errors.commentTooShort'));
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      await api.createCatalogTranslationRequest({
        title: trimmedTitle,
        authorName: authorName.trim() || undefined,
        sourceLanguage,
        targetLanguage,
        comment: trimmedComment || undefined,
        sourceUrl: sourceUrl.trim() || undefined,
      });
      setSuccess(t('translationRequests.created'));
      onSuccess?.();
      setTimeout(() => {
        handleClose();
      }, 1200);
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.data as { error?: string } | undefined;
        if (body?.error === 'Too many pending translation requests') {
          setCreateError(t('translationRequests.errors.pendingLimit'));
        } else {
          setCreateError(t('translationRequests.errors.createFailed'));
        }
      } else {
        setCreateError(t('translationRequests.errors.createFailed'));
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('translationRequests.modalTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleCreate} loading={creating} disabled={Boolean(success)}>
            {t('translationRequests.submit')}
          </Button>
        </>
      }
    >
      {success && (
        <p class="translation-requests-flash translation-requests-flash--success" role="status">
          {success}
        </p>
      )}
      {createError && (
        <p class="translation-requests-flash translation-requests-flash--error" role="alert">
          {createError}
        </p>
      )}
      <Input
        label={t('translationRequests.form.title')}
        placeholder={t('translationRequests.form.titlePlaceholder')}
        value={title}
        onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
      />
      <Input
        label={t('translationRequests.form.author')}
        placeholder={t('translationRequests.form.authorPlaceholder')}
        value={authorName}
        onInput={(e) => setAuthorName((e.target as HTMLInputElement).value)}
      />
      <ProjectLanguagePairFields
        idPrefix="suggest-translation"
        sourceLanguage={sourceLanguage}
        targetLanguage={targetLanguage}
        onSourceLanguageChange={setSourceLanguage}
        onTargetLanguageChange={setTargetLanguage}
      />
      <div class="form-group">
        <label class="form-label" for="suggest-translation-comment">
          {t('translationRequests.form.comment')}
        </label>
        <textarea
          id="suggest-translation-comment"
          class="form-input translation-request-form-comment"
          placeholder={t('translationRequests.form.commentPlaceholder')}
          value={comment}
          onInput={(e) => setComment((e.target as HTMLTextAreaElement).value)}
        />
      </div>
      <Input
        label={t('translationRequests.form.sourceUrl')}
        placeholder={t('translationRequests.form.sourceUrlPlaceholder')}
        value={sourceUrl}
        onInput={(e) => setSourceUrl((e.target as HTMLInputElement).value)}
      />
      <p class="project-language-pair-create-hint">{t('translationRequests.form.hint')}</p>
    </Modal>
  );
}
