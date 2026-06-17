import { useEffect, useMemo, useRef, useState, useCallback } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import type { PublicEntity, PublicEntityKind } from '../types';
import { Button, Input, Select, Icon, Modal, ConfirmModal } from '../components/ui';
import { AdminLayout } from '../components/Admin/AdminLayout';
import './AdminEntitiesPage.css';

const kindOptions: Array<{ value: PublicEntityKind | ''; i18nKey: string }> = [
  { value: '', i18nKey: 'admin.filter.all' },
  { value: 'tag', i18nKey: 'admin.kinds.tag' },
  { value: 'author', i18nKey: 'admin.kinds.author' },
  { value: 'translator', i18nKey: 'admin.kinds.translator' },
];

const isTag = (k: PublicEntityKind) => k === 'tag';

export function AdminEntitiesPage() {
  const { t } = useTranslation();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const editPhotoInputRef = useRef<HTMLInputElement>(null);

  // Create form state
  const [kind, setKind] = useState<PublicEntityKind>('tag');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<File | undefined>(undefined);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // List state
  const [entities, setEntities] = useState<PublicEntity[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [filterKind, setFilterKind] = useState<PublicEntityKind | ''>('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  // Edit modal state
  const [editingEntity, setEditingEntity] = useState<PublicEntity | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPhoto, setEditPhoto] = useState<File | undefined>(undefined);
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);
  const [editRemovePhoto, setEditRemovePhoto] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete modal state
  const [deletingEntity, setDeletingEntity] = useState<PublicEntity | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const selectOptions = useMemo(
    () => kindOptions.map((item) => ({ value: item.value, label: t(item.i18nKey) })),
    [t]
  );

  const reloadEntities = useCallback(async () => {
    setListLoading(true);
    try {
      const list = await api.getPublicEntities({
        kind: filterKind || undefined,
        search: searchDebounced || undefined,
        limit: 100,
      });
      setEntities(list);
    } catch (e) {
      console.error('Failed to load public entities', e);
      setEntities([]);
    } finally {
      setListLoading(false);
    }
  }, [filterKind, searchDebounced]);

  useEffect(() => {
    reloadEntities();
  }, [reloadEntities]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

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

  const openEditModal = (entity: PublicEntity) => {
    setEditingEntity(entity);
    setEditName(entity.name);
    setEditDescription(entity.description ?? '');
    setEditPhoto(undefined);
    setEditPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setEditRemovePhoto(false);
    setEditError(null);
    if (editPhotoInputRef.current) editPhotoInputRef.current.value = '';
  };

  const closeEditModal = () => {
    setEditingEntity(null);
    setEditPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const handleEditPhotoChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    setEditPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
    setEditPhoto(file);
    setEditRemovePhoto(false);
  };

  const handleEditRemovePhoto = () => {
    setEditPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setEditPhoto(undefined);
    setEditRemovePhoto(true);
    if (editPhotoInputRef.current) editPhotoInputRef.current.value = '';
  };

  const handleEditSubmit = async (e: Event) => {
    e.preventDefault();
    if (!editingEntity) return;
    setEditLoading(true);
    setEditError(null);

    try {
      const trimmedName = editName.trim();
      if (!trimmedName) {
        setEditError(t('admin.errors.nameRequired'));
        return;
      }

      const hasPhotoChange = editPhoto || editRemovePhoto;
      if (hasPhotoChange && !isTag(editingEntity.kind)) {
        await api.updatePublicEntityWithPhoto(editingEntity.id, {
          name: trimmedName,
          description: editDescription.trim() || undefined,
          photo: editPhoto,
          removePhoto: editRemovePhoto,
        });
      } else {
        await api.updatePublicEntity(editingEntity.id, {
          name: trimmedName,
          description: editDescription.trim() || null,
          photoUrl: editRemovePhoto && !isTag(editingEntity.kind) ? null : undefined,
        });
      }

      setSuccess(t('admin.messages.updated'));
      closeEditModal();
      await reloadEntities();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setEditError(t('admin.errors.forbidden'));
      } else {
        setEditError(t('admin.errors.updateFailed'));
      }
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteClick = (entity: PublicEntity) => {
    setDeletingEntity(entity);
    setDeleteError(null);
  };

  const handleDeleteConfirm = async (): Promise<boolean> => {
    if (!deletingEntity) return true;
    setDeleteLoading(true);
    setDeleteError(null);

    try {
      await api.deletePublicEntity(deletingEntity.id);
      setSuccess(t('admin.messages.deleted'));
      setDeletingEntity(null);
      await reloadEntities();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.data as { usageCount?: number } | undefined;
        const count = body?.usageCount ?? 0;
        setDeleteError(t('admin.errors.deleteUsed', { count }));
      } else {
        setDeleteError(t('admin.errors.deleteFailed'));
      }
      return false;
    } finally {
      setDeleteLoading(false);
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
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const displayPhotoPreview =
    editPhotoPreview || (editRemovePhoto ? null : editingEntity?.photoUrl) || null;

  return (
    <AdminLayout activeTab="entities">
      <div class="admin-entities-page">
        <div class="admin-entities-header">
          <p>{t('admin.subtitle')}</p>
        </div>

        <form class="admin-entities-form" onSubmit={handleSubmit}>
          <Select
            label={t('admin.form.kind')}
            options={selectOptions.filter((o) => o.value !== '')}
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
          <div class="admin-entities-list-header">
            <h2>{t('admin.list.title')}</h2>
            <div class="admin-entities-filters">
              <Select
                label=""
                options={selectOptions}
                value={filterKind}
                onChange={(e) =>
                  setFilterKind((e.target as HTMLSelectElement).value as PublicEntityKind | '')
                }
              />
              <Input
                placeholder={t('admin.form.searchPlaceholder')}
                value={search}
                onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
                aria-label={t('admin.form.searchPlaceholder')}
              />
            </div>
          </div>

          {listLoading ? (
            <p class="admin-entities-empty">{t('common.loading')}</p>
          ) : entities.length === 0 ? (
            <p class="admin-entities-empty">{t('admin.list.empty')}</p>
          ) : (
            <div class="admin-entities-container">
              {entities.map((entity) =>
                isTag(entity.kind) ? (
                  <span class="admin-entities-chip admin-entities-chip--actions" key={entity.id}>
                    <span class="admin-entities-chip-text">{entity.name}</span>
                    <div class="admin-entities-chip-actions">
                      <button
                        type="button"
                        class="admin-entities-action-btn"
                        onClick={() => openEditModal(entity)}
                        aria-label={t('admin.form.edit')}
                      >
                        <Icon name="edit" size="sm" />
                      </button>
                      <button
                        type="button"
                        class="admin-entities-action-btn admin-entities-action-btn--danger"
                        onClick={() => handleDeleteClick(entity)}
                        aria-label={t('admin.form.delete')}
                      >
                        <Icon name="delete" size="sm" />
                      </button>
                    </div>
                  </span>
                ) : (
                  <article class="admin-entities-card admin-entities-card--actions" key={entity.id}>
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
                    <div class="admin-entities-card-actions">
                      <button
                        type="button"
                        class="admin-entities-action-btn"
                        onClick={() => openEditModal(entity)}
                        aria-label={t('admin.form.edit')}
                      >
                        <Icon name="edit" size="sm" />
                      </button>
                      <button
                        type="button"
                        class="admin-entities-action-btn admin-entities-action-btn--danger"
                        onClick={() => handleDeleteClick(entity)}
                        aria-label={t('admin.form.delete')}
                      >
                        <Icon name="delete" size="sm" />
                      </button>
                    </div>
                  </article>
                )
              )}
            </div>
          )}
        </section>

        {/* Edit Modal */}
        <Modal
          isOpen={!!editingEntity}
          onClose={closeEditModal}
          title={t('admin.form.editTitle')}
          size="default"
          footer={
            editingEntity && (
              <div class="form-actions">
                <Button variant="secondary" onClick={closeEditModal} type="button">
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  form="admin-edit-form"
                  loading={editLoading}
                >
                  {t('admin.form.save')}
                </Button>
              </div>
            )
          }
        >
          {editingEntity && (
            <form
              id="admin-edit-form"
              class="admin-entities-form admin-entities-form--modal"
              onSubmit={handleEditSubmit}
            >
              <Input
                label={t('admin.form.name')}
                placeholder={t('admin.form.namePlaceholder')}
                value={editName}
                onInput={(e) => setEditName((e.target as HTMLInputElement).value)}
                maxLength={120}
              />

              {!isTag(editingEntity.kind) && (
                <>
                  <div class="form-group">
                    <label class="form-label" for="admin-edit-description">
                      {t('admin.form.description')}
                    </label>
                    <textarea
                      id="admin-edit-description"
                      class="form-input admin-entities-textarea"
                      value={editDescription}
                      onInput={(e) => setEditDescription((e.target as HTMLTextAreaElement).value)}
                      rows={4}
                      maxLength={2000}
                      placeholder={t('admin.form.descriptionPlaceholder')}
                    />
                  </div>

                  <div class="form-group admin-photo-upload">
                    <label class="form-label">{t('admin.form.photo')}</label>
                    <div class="admin-photo-zone">
                      <input
                        ref={editPhotoInputRef}
                        id="admin-edit-photo"
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        class="admin-photo-input"
                        onChange={handleEditPhotoChange}
                      />
                      {displayPhotoPreview ? (
                        <div class="admin-photo-preview">
                          <img src={displayPhotoPreview} alt="" class="admin-photo-preview-img" />
                          <button
                            type="button"
                            class="admin-photo-remove"
                            onClick={handleEditRemovePhoto}
                            aria-label={t('admin.form.removePhoto')}
                          >
                            <Icon name="close" size="sm" />
                          </button>
                        </div>
                      ) : (
                        <label for="admin-edit-photo" class="admin-photo-drop">
                          <Icon name="add_photo_alternate" size="md" />
                          <span>{t('admin.form.photoHint')}</span>
                        </label>
                      )}
                    </div>
                  </div>
                </>
              )}

              {editError && <p class="admin-entities-message error">{editError}</p>}
            </form>
          )}
        </Modal>

        {/* Delete Confirm Modal */}
        <ConfirmModal
          isOpen={!!deletingEntity}
          onClose={() => setDeletingEntity(null)}
          onConfirm={handleDeleteConfirm}
          title={t('admin.delete.title')}
          message={
            deleteError
              ? deleteError
              : deletingEntity
                ? t('admin.delete.message', { name: deletingEntity.name })
                : ''
          }
          confirmLabel={t('admin.form.delete')}
          cancelLabel={t('common.cancel')}
          variant="danger"
          loading={deleteLoading}
        />
      </div>
    </AdminLayout>
  );
}
