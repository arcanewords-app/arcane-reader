import type { RefObject } from 'preact';
import { useTranslation } from 'react-i18next';
import { Input } from '../ui';
import { AdminPhotoUpload } from './AdminPhotoUpload';
import './admin-shared.css';

interface AdminEntityFormFieldsProps {
  kind: 'tag' | 'author' | 'translator';
  name: string;
  onNameChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  photoInputId: string;
  photoInputRef?: RefObject<HTMLInputElement>;
  photoPreviewUrl: string | null;
  onPhotoChange: (e: Event) => void;
  onPhotoRemove: () => void;
  descriptionInputId: string;
}

export function AdminEntityFormFields({
  kind,
  name,
  onNameChange,
  description,
  onDescriptionChange,
  photoInputId,
  photoInputRef,
  photoPreviewUrl,
  onPhotoChange,
  onPhotoRemove,
  descriptionInputId,
}: AdminEntityFormFieldsProps) {
  const { t } = useTranslation();
  const showProfileFields = kind !== 'tag';

  return (
    <div class="admin-section-form admin-section-form--modal">
      <Input
        label={t('admin.form.name')}
        placeholder={t('admin.form.namePlaceholder')}
        value={name}
        onInput={(e) => onNameChange((e.target as HTMLInputElement).value)}
        maxLength={120}
        required
      />

      {showProfileFields && (
        <>
          <div class="form-group">
            <label class="form-label" for={descriptionInputId}>
              {t('admin.form.description')}
            </label>
            <textarea
              id={descriptionInputId}
              class="form-input admin-textarea"
              value={description}
              onInput={(e) => onDescriptionChange((e.target as HTMLTextAreaElement).value)}
              rows={4}
              maxLength={2000}
              placeholder={t('admin.form.descriptionPlaceholder')}
            />
          </div>

          <AdminPhotoUpload
            inputId={photoInputId}
            inputRef={photoInputRef}
            previewUrl={photoPreviewUrl}
            onFileChange={onPhotoChange}
            onRemove={onPhotoRemove}
          />
        </>
      )}
    </div>
  );
}
