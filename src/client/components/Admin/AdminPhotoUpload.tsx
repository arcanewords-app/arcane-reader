import type { RefObject } from 'preact';
import { useTranslation } from 'react-i18next';
import { Icon } from '../ui';
import './admin-shared.css';
import './AdminPhotoUpload.css';

interface AdminPhotoUploadProps {
  inputId: string;
  inputRef?: RefObject<HTMLInputElement>;
  previewUrl: string | null;
  onFileChange: (e: Event) => void;
  onRemove: () => void;
}

export function AdminPhotoUpload({
  inputId,
  inputRef,
  previewUrl,
  onFileChange,
  onRemove,
}: AdminPhotoUploadProps) {
  const { t } = useTranslation();

  return (
    <div class="form-group admin-photo-upload">
      <label class="form-label">{t('admin.form.photo')}</label>
      <div class="admin-photo-zone">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          class="admin-photo-input"
          onChange={onFileChange}
        />
        {previewUrl ? (
          <div class="admin-photo-preview">
            <img src={previewUrl} alt="" class="admin-photo-preview-img" />
            <button
              type="button"
              class="admin-photo-remove"
              onClick={onRemove}
              aria-label={t('admin.form.removePhoto')}
            >
              <Icon name="close" size="sm" />
            </button>
          </div>
        ) : (
          <label for={inputId} class="admin-photo-drop">
            <Icon name="add_photo_alternate" size="md" />
            <span>{t('admin.form.photoHint')}</span>
          </label>
        )}
      </div>
    </div>
  );
}
