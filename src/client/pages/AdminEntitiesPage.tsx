import { useEffect, useMemo, useRef, useState, useCallback } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { api, ApiError } from '../api/client';
import type { PublicEntity, PublicEntityKind } from '../types';
import { Button, Input, Modal, ConfirmModal } from '../components/ui';
import {
  AdminLayout,
  AdminSection,
  AdminFlash,
  AdminSegmentTabs,
  AdminEntityFormFields,
} from '../components/Admin';
import './AdminEntitiesPage.css';

const ENTITY_KINDS: PublicEntityKind[] = ['tag', 'author', 'translator'];

function parseKindParam(kind?: string): PublicEntityKind {
  if (kind && ENTITY_KINDS.includes(kind as PublicEntityKind)) {
    return kind as PublicEntityKind;
  }
  return 'tag';
}

interface AdminEntitiesPageProps {
  kind?: string;
}

export function AdminEntitiesPage({ kind: kindParam }: AdminEntitiesPageProps) {
  const { t } = useTranslation();
  const kind = parseKindParam(kindParam);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const editPhotoInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<File | undefined>(undefined);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [entities, setEntities] = useState<PublicEntity[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  const [editingEntity, setEditingEntity] = useState<PublicEntity | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPhoto, setEditPhoto] = useState<File | undefined>(undefined);
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);
  const [editRemovePhoto, setEditRemovePhoto] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deletingEntity, setDeletingEntity] = useState<PublicEntity | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const kindTabs = useMemo(
    () =>
      ENTITY_KINDS.map((k) => ({
        id: k,
        path: `/admin/entities/${k}`,
        label: t(`admin.kinds.${k}`),
      })),
    [t]
  );

  const createTitle = t(`admin.entities.createTitle.${kind}`);
  const introText = t(`admin.entities.intro.${kind}`);

  useEffect(() => {
    if (!kindParam || !ENTITY_KINDS.includes(kindParam as PublicEntityKind)) {
      route('/admin/entities/tag', true);
    }
  }, [kindParam]);

  const reloadEntities = useCallback(async () => {
    setListLoading(true);
    try {
      const list = await api.getPublicEntities({
        kind,
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
  }, [kind, searchDebounced]);

  useEffect(() => {
    reloadEntities();
  }, [reloadEntities]);

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setName('');
    setDescription('');
    setPhoto(undefined);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setSearch('');
    setSearchDebounced('');
    setError(null);
    setSuccess(null);
    if (photoInputRef.current) photoInputRef.current.value = '';
  }, [kind]);

  const clearForm = () => {
    setName('');
    setDescription('');
    setPhoto(undefined);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (photoInputRef.current) photoInputRef.current.value = '';
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

      const isTagKind = editingEntity.kind === 'tag';
      const hasPhotoChange = editPhoto || editRemovePhoto;
      if (hasPhotoChange && !isTagKind) {
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
          photoUrl: editRemovePhoto && !isTagKind ? null : undefined,
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

      if (kind === 'tag') {
        await api.createPublicEntity({ kind, name: trimmedName });
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
      <div class="admin-page admin-entities-page">
        <p class="admin-intro">{introText}</p>

        <AdminSegmentTabs
          tabs={kindTabs}
          activeId={kind}
          ariaLabel={t('admin.entities.kindTabsAria')}
        />

        <AdminFlash error={error} success={success} />

        <AdminSection title={createTitle} as="form" onSubmit={handleSubmit}>
          <AdminEntityFormFields
            kind={kind}
            name={name}
            onNameChange={setName}
            description={description}
            onDescriptionChange={setDescription}
            photoInputId="admin-entity-photo"
            photoInputRef={photoInputRef}
            photoPreviewUrl={photoPreview}
            onPhotoChange={handlePhotoChange}
            onPhotoRemove={handleRemovePhoto}
            descriptionInputId="admin-entity-description"
          />
          <div class="admin-form-actions">
            <Button type="submit" loading={loading}>
              {t(`admin.entities.submit.${kind}`)}
            </Button>
          </div>
        </AdminSection>

        <AdminSection title={t('admin.list.title')}>
          <div class="admin-list-filters">
            <Input
              placeholder={t('admin.form.searchPlaceholder')}
              value={search}
              onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
              aria-label={t('admin.form.searchPlaceholder')}
            />
          </div>

          {listLoading ? (
            <p class="admin-empty">{t('common.loading')}</p>
          ) : entities.length === 0 ? (
            <p class="admin-empty">{t('admin.list.empty')}</p>
          ) : kind === 'tag' ? (
            <ul class="admin-entities-chip-list">
              {entities.map((entity) => (
                <li key={entity.id} class="admin-entities-chip-item">
                  <span class="admin-entities-chip">{entity.name}</span>
                  <div class="admin-list-card-actions">
                    <Button variant="secondary" size="sm" onClick={() => openEditModal(entity)}>
                      {t('admin.form.edit')}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setDeletingEntity(entity)}>
                      {t('common.delete')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <ul class="admin-list">
              {entities.map((entity) => (
                <li key={entity.id} class="admin-list-card admin-entities-profile-card">
                  {entity.photoUrl && (
                    <img
                      src={entity.photoUrl}
                      alt={entity.name}
                      class="admin-entities-card-photo"
                    />
                  )}
                  <div class="admin-entities-card-content">
                    <h3>{entity.name}</h3>
                    {entity.description && <p>{entity.description}</p>}
                  </div>
                  <div class="admin-list-card-actions">
                    <Button variant="secondary" size="sm" onClick={() => openEditModal(entity)}>
                      {t('admin.form.edit')}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setDeletingEntity(entity)}>
                      {t('common.delete')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AdminSection>

        <Modal
          isOpen={!!editingEntity}
          onClose={closeEditModal}
          title={t('admin.form.editTitle')}
          footer={
            editingEntity && (
              <div class="admin-form-actions">
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
            <form id="admin-edit-form" onSubmit={handleEditSubmit}>
              <AdminEntityFormFields
                kind={editingEntity.kind}
                name={editName}
                onNameChange={setEditName}
                description={editDescription}
                onDescriptionChange={setEditDescription}
                photoInputId="admin-edit-photo"
                photoInputRef={editPhotoInputRef}
                photoPreviewUrl={displayPhotoPreview}
                onPhotoChange={handleEditPhotoChange}
                onPhotoRemove={handleEditRemovePhoto}
                descriptionInputId="admin-edit-description"
              />
              {editError && <p class="admin-flash admin-flash--error">{editError}</p>}
            </form>
          )}
        </Modal>

        <ConfirmModal
          isOpen={!!deletingEntity}
          onClose={() => {
            setDeletingEntity(null);
            setDeleteError(null);
          }}
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
