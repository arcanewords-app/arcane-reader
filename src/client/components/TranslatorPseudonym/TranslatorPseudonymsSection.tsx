import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { PublicEntity } from '../../types';
import { api, ApiError } from '../../api/client';
import { MAX_TRANSLATOR_PSEUDONYMS_PER_USER } from '../../../shared/translatorPseudonyms';
import { Modal, Button, ConfirmModal, Icon } from '../ui';
import { AdminEntityFormFields } from '../Admin/AdminEntityFormFields';
import { EntityCard } from '../EntityCard/EntityCard';
import './TranslatorPseudonymsSection.css';

interface TranslatorPseudonymFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingEntity: PublicEntity | null;
  onSaved: (entity: PublicEntity) => void;
  /** Stacking above EntityPickerModal when opened inline. */
  layer?: 'base' | 'stacked';
}

export function TranslatorPseudonymFormModal({
  isOpen,
  onClose,
  editingEntity,
  onSaved,
  layer = 'base',
}: TranslatorPseudonymFormModalProps) {
  const { t } = useTranslation();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<File | undefined>();
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(editingEntity?.name ?? '');
    setDescription(editingEntity?.description ?? '');
    setPhoto(undefined);
    setPhotoPreview(null);
    setRemovePhoto(false);
    setError(null);
    if (photoInputRef.current) photoInputRef.current.value = '';
  }, [isOpen, editingEntity]);

  const handlePhotoChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
    setPhoto(file);
    setRemovePhoto(false);
  };

  const handlePhotoRemove = () => {
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPhoto(undefined);
    setRemovePhoto(true);
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const handleSubmit = async (e?: Event) => {
    e?.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t('translatorPseudonym.nameRequired'));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const entity = editingEntity
        ? await api.updateTranslatorPseudonym(editingEntity.id, {
            name: trimmedName,
            description: description.trim() || undefined,
            photo,
            removePhoto,
          })
        : await api.createTranslatorPseudonym({
            name: trimmedName,
            description: description.trim() || undefined,
            photo,
          });
      onSaved(entity);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PSEUDONYM_LIMIT') {
        setError(t('translatorPseudonym.limitReached'));
      } else {
        setError(t('translatorPseudonym.saveFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const displayPhotoPreview =
    photoPreview || (removePhoto ? null : editingEntity?.photoUrl) || null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      layer={layer}
      title={
        editingEntity ? t('translatorPseudonym.editTitle') : t('translatorPseudonym.createTitle')
      }
      footer={
        <div class="form-actions">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={loading}>
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <form class="translator-pseudonym-form" onSubmit={handleSubmit}>
        {error && (
          <div class="translator-pseudonym-form__error" role="alert">
            {error}
          </div>
        )}
        <AdminEntityFormFields
          kind="translator"
          name={name}
          onNameChange={setName}
          description={description}
          onDescriptionChange={setDescription}
          photoInputId="translator-pseudonym-photo"
          photoInputRef={photoInputRef}
          photoPreviewUrl={displayPhotoPreview}
          onPhotoChange={handlePhotoChange}
          onPhotoRemove={handlePhotoRemove}
          descriptionInputId="translator-pseudonym-description"
        />
      </form>
    </Modal>
  );
}

interface TranslatorPseudonymsSectionProps {
  compact?: boolean;
  /** Inside a profile card — no outer border/margin */
  inCard?: boolean;
  onListChange?: (entities: PublicEntity[]) => void;
}

export function TranslatorPseudonymsSection({
  compact = false,
  inCard = false,
  onListChange,
}: TranslatorPseudonymsSectionProps) {
  const { t } = useTranslation();
  const [active, setActive] = useState<PublicEntity[]>([]);
  const [hidden, setHidden] = useState<PublicEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<PublicEntity | null>(null);
  const [hidingEntity, setHidingEntity] = useState<PublicEntity | null>(null);
  const [hideLoading, setHideLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await api.getTranslatorPseudonyms({ includeHidden: true });
      const visible = all.filter((e) => (e.entityStatus ?? 'active') === 'active');
      const concealed = all.filter((e) => e.entityStatus === 'blocked');
      setActive(visible);
      setHidden(concealed);
      onListChange?.(visible);
    } catch {
      setError(t('translatorPseudonym.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t, onListChange]);

  useEffect(() => {
    reload();
  }, [reload]);

  const openCreate = () => {
    setEditingEntity(null);
    setFormOpen(true);
  };

  const openEdit = (entity: PublicEntity) => {
    setEditingEntity(entity);
    setFormOpen(true);
  };

  const handleHide = async () => {
    if (!hidingEntity) return;
    setHideLoading(true);
    try {
      await api.hideTranslatorPseudonym(hidingEntity.id);
      setHidingEntity(null);
      await reload();
    } catch {
      setError(t('translatorPseudonym.hideFailed'));
    } finally {
      setHideLoading(false);
    }
  };

  const atLimit = active.length >= MAX_TRANSLATOR_PSEUDONYMS_PER_USER;

  if (loading) {
    return <div class="translator-pseudonyms-loading">{t('common.loading')}</div>;
  }

  return (
    <div
      class={`translator-pseudonyms-section${compact ? ' translator-pseudonyms-section--compact' : ''}${inCard ? ' translator-pseudonyms-section--in-card' : ''}`}
    >
      <div class="translator-pseudonyms-header">
        <h3 class="translator-pseudonyms-title">{t('translatorPseudonym.sectionTitle')}</h3>
        <div class="translator-pseudonyms-header__actions">
          <span class="translator-pseudonyms-counter">
            {t('translatorPseudonym.counter', {
              count: active.length,
              max: MAX_TRANSLATOR_PSEUDONYMS_PER_USER,
            })}
          </span>
          <Button variant="secondary" size="sm" onClick={openCreate} disabled={atLimit}>
            <Icon name="add" size="sm" />
            {t('translatorPseudonym.create')}
          </Button>
        </div>
      </div>
      {atLimit && (
        <p class="translator-pseudonyms-limit-hint">{t('translatorPseudonym.limitReached')}</p>
      )}

      {error && (
        <div class="translator-pseudonyms-error" role="alert">
          {error}
        </div>
      )}

      {active.length === 0 ? (
        <p class="translator-pseudonyms-empty">{t('translatorPseudonym.empty')}</p>
      ) : (
        <div class="translator-pseudonyms-grid">
          {active.map((entity) => (
            <div key={entity.id} class="translator-pseudonyms-card-wrap">
              <EntityCard entity={entity} compact={compact} />
              <div class="translator-pseudonyms-card-actions">
                <Button variant="secondary" size="sm" onClick={() => openEdit(entity)}>
                  {t('translatorPseudonym.edit')}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setHidingEntity(entity)}>
                  {t('translatorPseudonym.hide')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {hidden.length > 0 && (
        <details class="translator-pseudonyms-hidden">
          <summary>{t('translatorPseudonym.hiddenSection')}</summary>
          <div class="translator-pseudonyms-grid">
            {hidden.map((entity) => (
              <EntityCard key={entity.id} entity={entity} compact />
            ))}
          </div>
        </details>
      )}

      <TranslatorPseudonymFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        editingEntity={editingEntity}
        onSaved={async () => {
          await reload();
        }}
      />

      <ConfirmModal
        isOpen={hidingEntity != null}
        onClose={() => setHidingEntity(null)}
        onConfirm={handleHide}
        title={t('translatorPseudonym.hide')}
        message={t('translatorPseudonym.hideConfirm')}
        confirmLabel={t('translatorPseudonym.hide')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        loading={hideLoading}
      />
    </div>
  );
}
