import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import type { PublicEntity, PublicEntityKind } from '../types';
import { Button, Input, Select, Icon } from '../components/ui';
import './AdminEntitiesPage.css';

const kindOptions: Array<{ value: PublicEntityKind; i18nKey: string }> = [
  { value: 'tag', i18nKey: 'admin.kinds.tag' },
  { value: 'author', i18nKey: 'admin.kinds.author' },
  { value: 'translator', i18nKey: 'admin.kinds.translator' },
];

const isTag = (k: PublicEntityKind) => k === 'tag';

export function AdminEntitiesPage() {
  const { t } = useTranslation();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<PublicEntityKind>('tag');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<File | undefined>(undefined);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [entities, setEntities] = useState<PublicEntity[]>([]);

  const selectOptions = useMemo(
    () => kindOptions.map((item) => ({ value: item.value, label: t(item.i18nKey) })),
    [t]
  );

  const reloadEntities = async () => {
    const list = await api.getPublicEntities({ limit: 50 });
    setEntities(list);
  };

  useEffect(() => {
    reloadEntities().catch((e) => {
      console.error('Failed to load public entities', e);
    });
  }, []);

  useEffect(() => {
    if (isTag(kind)) {
      setDescription('');
      setPhoto(undefined);
      setPhotoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  }, [kind]);

  const clearForm = () => {
    setName('');
    setDescription('');
    setPhoto(undefined);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (photoInputRef.current) {
      photoInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const trimmedName = name.trim();
      const trimmedDescription = description.trim();
      if (!trimmedName) {
        setError(t('admin.errors.nameRequired'));
        return;
      }

      if (isTag(kind)) {
        await api.createPublicEntity({
          kind,
          name: trimmedName,
        });
      } else {
        await api.createPublicEntityWithPhoto({
          kind,
          name: trimmedName,
          description: trimmedDescription || undefined,
          photo,
        });
      }

      clearForm();
      setSuccess(t('admin.messages.created'));
      await reloadEntities();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError(t('admin.errors.forbidden'));
      } else {
        setError(t('admin.errors.createFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
    setPhoto(file);
  };

  const handleRemovePhoto = () => {
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPhoto(undefined);
    if (photoInputRef.current) {
      photoInputRef.current.value = '';
    }
  };

  return (
    <div class="admin-entities-page">
      <div class="admin-entities-header">
        <h1>{t('admin.title')}</h1>
        <p>{t('admin.subtitle')}</p>
      </div>

      <form class="admin-entities-form" onSubmit={handleSubmit}>
        <Select
          label={t('admin.form.kind')}
          options={selectOptions}
          value={kind}
          onChange={(e) => setKind((e.target as HTMLSelectElement).value as PublicEntityKind)}
        />

        <Input
          label={t('admin.form.name')}
          placeholder={t('admin.form.namePlaceholder')}
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          maxLength={120}
        />

        {!isTag(kind) && (
          <div class="form-group">
            <label class="form-label" for="admin-entity-description">
              {t('admin.form.description')}
            </label>
            <textarea
              id="admin-entity-description"
              class="form-input admin-entities-textarea"
              value={description}
              onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
              rows={4}
              maxLength={2000}
              placeholder={t('admin.form.descriptionPlaceholder')}
            />
          </div>
        )}

        {!isTag(kind) && (
          <div class="form-group admin-photo-upload">
            <label class="form-label">{t('admin.form.photo')}</label>
            <div class="admin-photo-zone">
              <input
                ref={photoInputRef}
                id="admin-entity-photo"
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                class="admin-photo-input"
                onChange={handlePhotoChange}
              />
              {photoPreview ? (
                <div class="admin-photo-preview">
                  <img src={photoPreview} alt="" class="admin-photo-preview-img" />
                  <button
                    type="button"
                    class="admin-photo-remove"
                    onClick={handleRemovePhoto}
                    aria-label={t('admin.form.removePhoto')}
                  >
                    <Icon name="close" size="sm" />
                  </button>
                </div>
              ) : (
                <label for="admin-entity-photo" class="admin-photo-drop">
                  <Icon name="add_photo_alternate" size="md" />
                  <span>{t('admin.form.photoHint')}</span>
                </label>
              )}
            </div>
          </div>
        )}

        {error && <p class="admin-entities-message error">{error}</p>}
        {success && <p class="admin-entities-message success">{success}</p>}

        <div class="admin-entities-actions">
          <Button type="submit" loading={loading}>
            {t('admin.form.submit')}
          </Button>
        </div>
      </form>

      <section class="admin-entities-list">
        <h2>{t('admin.list.title')}</h2>
        {entities.length === 0 ? (
          <p class="admin-entities-empty">{t('admin.list.empty')}</p>
        ) : (
          <div class="admin-entities-container">
            {entities.map((entity) =>
              isTag(entity.kind) ? (
                <span class="admin-entities-chip" key={entity.id}>
                  {entity.name}
                </span>
              ) : (
                <article class="admin-entities-card" key={entity.id}>
                  {entity.photoUrl && (
                    <img
                      src={entity.photoUrl}
                      alt={entity.name}
                      class="admin-entities-card-photo"
                    />
                  )}
                  <div class="admin-entities-card-content">
                    <span class="admin-entities-kind">{t(`admin.kinds.${entity.kind}`)}</span>
                    <h3>{entity.name}</h3>
                    {entity.description && <p>{entity.description}</p>}
                  </div>
                </article>
              )
            )}
          </div>
        )}
      </section>
    </div>
  );
}
