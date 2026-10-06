import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { api, ApiError } from '../api/client';
import type { AdminProjectCard, PublicEntity, TranslationStatus } from '../types';
import { TRANSLATION_STATUSES } from '../../shared/translation-status';
import { useUserRole } from '../hooks/useUserRole';
import { Button, Input, Select } from '../components/ui';
import { AdminLayout, AdminSection, AdminFlash } from '../components/Admin';
import { EntityCard } from '../components/EntityCard/EntityCard';
import { EntityPickerModal } from '../components/EntityCard/EntityPickerModal';
import { TagChip } from '../components/EntityCard/TagChip';
import '../components/Admin/admin-shared.css';
import './AdminProjectCardPage.css';

const STATUS_LABEL_KEY: Record<TranslationStatus, string> = {
  in_progress: 'projectInfo.translationStatus.inProgress',
  complete: 'projectInfo.translationStatus.complete',
  abandoned: 'projectInfo.translationStatus.abandoned',
  experimental: 'projectInfo.translationStatus.experimental',
};

type PickerKind = 'author' | 'translator' | 'tag';

interface AdminProjectCardPageProps {
  projectId?: string;
}

export function AdminProjectCardPage({ projectId }: AdminProjectCardPageProps) {
  const { t } = useTranslation();
  const { user } = useUserRole();
  const fileRef = useRef<HTMLInputElement>(null);

  const [card, setCard] = useState<AdminProjectCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [name, setName] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const [catalogTitle, setCatalogTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [translationStatus, setTranslationStatus] = useState<TranslationStatus | ''>('');
  const [author, setAuthor] = useState<PublicEntity | null>(null);
  const [translator, setTranslator] = useState<PublicEntity | null>(null);
  const [tags, setTags] = useState<PublicEntity[]>([]);
  const [picker, setPicker] = useState<PickerKind | null>(null);

  const applyCard = useCallback((next: AdminProjectCard, entities: PublicEntity[]) => {
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    setCard(next);
    setName(next.name);
    setOriginalTitle(next.originalTitle ?? '');
    setCatalogTitle(next.catalogTitle ?? '');
    setDescription(next.description ?? '');
    setSourceUrl(next.sourceUrl ?? '');
    setTranslationStatus(next.translationStatus ?? '');
    setAuthor(next.authorEntityId ? (byId.get(next.authorEntityId) ?? null) : null);
    setTranslator(next.translatorEntityId ? (byId.get(next.translatorEntityId) ?? null) : null);
    setTags(
      next.tagEntityIds
        .map((id) => byId.get(id))
        .filter((entity): entity is PublicEntity => Boolean(entity))
    );
  }, []);

  const load = useCallback(async () => {
    if (!projectId) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const next = await api.getAdminProjectCard(projectId);
      const ids = [next.authorEntityId, next.translatorEntityId, ...next.tagEntityIds].filter(
        (id): id is string => Boolean(id)
      );
      const entities = ids.length > 0 ? await api.getPublicEntitiesByIds(ids) : [];
      applyCard(next, entities);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
      } else {
        setError(t('admin.projects.card.loadFailed'));
      }
    } finally {
      setLoading(false);
    }
  }, [applyCard, projectId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const statusOptions = useMemo(
    () => [
      { value: '', label: t('admin.projects.card.statusNone') },
      ...TRANSLATION_STATUSES.map((status) => ({
        value: status,
        label: t(STATUS_LABEL_KEY[status]),
      })),
    ],
    [t]
  );

  const saveError = (err: unknown): string => {
    if (err instanceof ApiError && err.code === 'INVALID_TRANSLATOR_PSEUDONYM') {
      return t('admin.projects.card.invalidTranslator');
    }
    if (err instanceof ApiError && err.code === 'INVALID_CATALOG_ENTITY') {
      return t('admin.projects.card.invalidEntity');
    }
    return t('admin.projects.card.saveFailed');
  };

  const handleSave = async (event: Event) => {
    event.preventDefault();
    if (!projectId || !card) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await api.updateAdminProjectCard(projectId, {
        name: name.trim(),
        originalTitle: originalTitle.trim() || null,
        ...(card.publicationId ? { catalogTitle: catalogTitle.trim() || null } : {}),
        description: description.trim() || null,
        sourceUrl: sourceUrl.trim() || null,
        authorEntityId: author?.id ?? null,
        translatorEntityId: translator?.id ?? null,
        tagEntityIds: tags.map((tag) => tag.id),
        translationStatus: translationStatus || null,
      });
      applyCard(
        updated,
        [author, translator, ...tags].filter((entity): entity is PublicEntity => Boolean(entity))
      );
      setSuccess(t('admin.projects.card.saved'));
    } catch (err) {
      setError(saveError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCover = async (file: File | undefined) => {
    if (!projectId || !file) return;
    setCoverBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await api.uploadAdminProjectCover(projectId, file);
      setCard(updated);
      setSuccess(t('admin.projects.card.saved'));
    } catch {
      setError(t('admin.projects.card.coverFailed'));
    } finally {
      setCoverBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleRemoveCover = async () => {
    if (!projectId) return;
    setCoverBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await api.deleteAdminProjectCover(projectId);
      setCard(updated);
      setSuccess(t('admin.projects.card.saved'));
    } catch {
      setError(t('admin.projects.card.coverFailed'));
    } finally {
      setCoverBusy(false);
    }
  };

  const publicationLabel = card?.publicationStatus
    ? t(`admin.projects.publicationStatus.${card.publicationStatus}`)
    : t('admin.projects.publicationStatus.none');

  return (
    <AdminLayout activeTab="projects">
      <a
        class="admin-card-back"
        href="/admin/projects"
        onClick={(event) => {
          event.preventDefault();
          route('/admin/projects');
        }}
      >
        {t('admin.projects.card.back')}
      </a>
      <AdminFlash error={error} success={success} />
      {loading && <p class="admin-card-status">{t('common.loading')}</p>}
      {!loading && notFound && <p class="admin-card-status">{t('admin.projects.card.notFound')}</p>}
      {!loading && card && (
        <AdminSection
          as="form"
          title={t('admin.projects.card.title')}
          onSubmit={(event) => {
            void handleSave(event);
          }}
        >
          <p class="admin-card-meta">
            {t('admin.projects.owner', { email: card.ownerEmail || '—' })}
            {' · '}
            {card.sourceLanguage} → {card.targetLanguage}
            {' · '}
            {publicationLabel}
          </p>

          <Input
            id="admin-card-name"
            label={t('admin.projects.card.name')}
            value={name}
            onInput={(event) => setName(event.currentTarget.value)}
          />
          <Input
            id="admin-card-original-title"
            label={t('admin.projects.card.originalTitle')}
            value={originalTitle}
            onInput={(event) => setOriginalTitle(event.currentTarget.value)}
          />
          <Input
            id="admin-card-catalog-title"
            label={t('admin.projects.card.catalogTitle')}
            value={catalogTitle}
            disabled={!card.publicationId}
            onInput={(event) => setCatalogTitle(event.currentTarget.value)}
          />
          {!card.publicationId && (
            <p class="admin-card-hint">{t('admin.projects.card.catalogTitleHint')}</p>
          )}

          <div class="form-group">
            <label class="form-label" for="admin-card-description">
              {t('admin.projects.card.description')}
            </label>
            <textarea
              id="admin-card-description"
              class="form-input admin-card-description"
              value={description}
              onInput={(event) => setDescription(event.currentTarget.value)}
            />
          </div>

          <Input
            id="admin-card-source"
            label={t('admin.projects.card.sourceUrl')}
            value={sourceUrl}
            onInput={(event) => setSourceUrl(event.currentTarget.value)}
          />

          <div class="admin-card-cover">
            <span class="form-label">{t('admin.projects.card.cover')}</span>
            {card.coverImageUrl && (
              <img class="admin-card-cover-image" src={card.coverImageUrl} alt="" />
            )}
            <div class="admin-card-actions">
              <Button
                type="button"
                variant="secondary"
                disabled={coverBusy}
                onClick={() => fileRef.current?.click()}
              >
                {t('admin.projects.card.uploadCover')}
              </Button>
              {card.coverImageUrl && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={coverBusy}
                  onClick={() => {
                    void handleRemoveCover();
                  }}
                >
                  {t('admin.projects.card.removeCover')}
                </Button>
              )}
            </div>
            <input
              ref={fileRef}
              class="admin-card-file"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                void handleCover(file);
              }}
            />
          </div>

          <div class="admin-card-entity">
            <span class="form-label">{t('admin.projects.card.author')}</span>
            {author && <EntityCard entity={author} />}
            <div class="admin-card-actions">
              <Button type="button" variant="secondary" onClick={() => setPicker('author')}>
                {author
                  ? t('admin.projects.card.changeAuthor')
                  : t('admin.projects.card.selectAuthor')}
              </Button>
              {author && (
                <Button type="button" variant="secondary" onClick={() => setAuthor(null)}>
                  {t('admin.projects.card.removeAuthor')}
                </Button>
              )}
            </div>
          </div>

          <div class="admin-card-entity">
            <span class="form-label">{t('admin.projects.card.translator')}</span>
            {translator && <EntityCard entity={translator} />}
            <div class="admin-card-actions">
              <Button type="button" variant="secondary" onClick={() => setPicker('translator')}>
                {translator
                  ? t('admin.projects.card.changeTranslator')
                  : t('admin.projects.card.selectTranslator')}
              </Button>
              {translator && (
                <Button type="button" variant="secondary" onClick={() => setTranslator(null)}>
                  {t('admin.projects.card.removeTranslator')}
                </Button>
              )}
            </div>
          </div>

          <div class="admin-card-entity">
            <span class="form-label">{t('admin.projects.card.tags')}</span>
            <div class="admin-card-tags">
              {tags.map((tag) => (
                <TagChip
                  key={tag.id}
                  entity={tag}
                  removable
                  onRemove={() =>
                    setTags((current) => current.filter((item) => item.id !== tag.id))
                  }
                />
              ))}
            </div>
            <Button type="button" variant="secondary" onClick={() => setPicker('tag')}>
              {t('admin.projects.card.addTags')}
            </Button>
          </div>

          <Select
            id="admin-card-status"
            label={t('admin.projects.card.translationStatus')}
            options={statusOptions}
            value={translationStatus}
            onChange={(event) =>
              setTranslationStatus(event.currentTarget.value as TranslationStatus | '')
            }
          />

          <div class="admin-card-actions">
            <Button type="submit" loading={saving}>
              {t('admin.projects.card.save')}
            </Button>
          </div>
        </AdminSection>
      )}

      <EntityPickerModal
        isOpen={picker === 'author'}
        onClose={() => setPicker(null)}
        kind="author"
        mode="single"
        selectedIds={author ? [author.id] : []}
        onSelect={(entities) => {
          setAuthor(entities[0] ?? null);
          setPicker(null);
        }}
      />
      <EntityPickerModal
        isOpen={picker === 'translator'}
        onClose={() => setPicker(null)}
        kind="translator"
        mode="single"
        translatorScope="public"
        allowCreate={false}
        ownershipHintUserId={user?.id}
        selectedIds={translator ? [translator.id] : []}
        onSelect={(entities) => {
          setTranslator(entities[0] ?? null);
          setPicker(null);
        }}
      />
      <EntityPickerModal
        isOpen={picker === 'tag'}
        onClose={() => setPicker(null)}
        kind="tag"
        mode="multi"
        selectedIds={tags.map((tag) => tag.id)}
        onSelect={(entities) => {
          setTags(entities);
          setPicker(null);
        }}
      />
    </AdminLayout>
  );
}
