import { useState, useRef, useCallback } from 'preact/hooks';
import type { Dispatch, StateUpdater } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { Project, ProjectWithChapterList, Publication } from '../../types.js';
import { Button, LoadingSpinner, Icon } from '../ui';
import { api } from '../../api/client.js';
import { invalidateProject } from '../../store/projects.js';
import '../ProjectInfo.css';

export interface ProjectPublicationSectionProps {
  project: Project | ProjectWithChapterList;
  publication: Publication | null;
  publicationLoading: boolean;
  setPublication: Dispatch<StateUpdater<Publication | null>>;
  stats: { chapters: number; translated: number; glossary: number };
  hasPublishableTranslator: boolean;
  buildingExports: boolean;
  updatingPublication: boolean;
  unpublishing: boolean;
  onRefreshProject: () => Promise<void>;
  onOpenPublishModal: () => void;
  onUnpublishRequest: () => void;
  onUpdatePublication: () => void;
  onBuildExports: () => void;
  onError: (title: string, message: string) => void;
}

export function ProjectPublicationSection({
  project,
  publication,
  publicationLoading,
  setPublication,
  stats,
  hasPublishableTranslator,
  buildingExports,
  updatingPublication,
  unpublishing,
  onRefreshProject,
  onOpenPublishModal,
  onUnpublishRequest,
  onUpdatePublication,
  onBuildExports,
  onError,
}: ProjectPublicationSectionProps) {
  const { t } = useTranslation();
  const [updatingShowGlossary, setUpdatingShowGlossary] = useState(false);
  const [editingSourceUrl, setEditingSourceUrl] = useState(false);
  const [sourceUrlDraft, setSourceUrlDraft] = useState('');
  const [savingSourceUrl, setSavingSourceUrl] = useState(false);
  const sourceUrlInputRef = useRef<HTMLInputElement>(null);

  const startEditingSourceUrl = useCallback(() => {
    setSourceUrlDraft(project.metadata?.sourceUrl ?? '');
    setEditingSourceUrl(true);
    setTimeout(() => sourceUrlInputRef.current?.focus(), 0);
  }, [project.metadata?.sourceUrl]);

  const cancelEditingSourceUrl = useCallback(() => {
    setEditingSourceUrl(false);
    setSourceUrlDraft('');
  }, []);

  const saveSourceUrl = useCallback(async () => {
    const trimmed = sourceUrlDraft.trim();
    if (trimmed) {
      try {
        new URL(trimmed);
      } catch {
        onError(t('projectInfo.errorInvalidSourceUrl'), t('projectInfo.errorInvalidSourceUrl'));
        return;
      }
    }
    setSavingSourceUrl(true);
    try {
      await api.updateProjectMetadata(project.id, {
        ...project.metadata,
        sourceUrl: trimmed || undefined,
      });
      invalidateProject(project.id);
      await onRefreshProject();
      setEditingSourceUrl(false);
      setSourceUrlDraft('');
    } catch (error) {
      onError(
        t('projectInfo.errorSaveSourceUrl'),
        error instanceof Error ? error.message : t('projectInfo.errorSaveSourceUrl')
      );
    } finally {
      setSavingSourceUrl(false);
    }
  }, [project.id, project.metadata, sourceUrlDraft, onRefreshProject, onError, t]);

  const handleSourceUrlKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void saveSourceUrl();
      } else if (e.key === 'Escape') {
        cancelEditingSourceUrl();
      }
    },
    [saveSourceUrl, cancelEditingSourceUrl]
  );

  const handleShowGlossaryChange = useCallback(async () => {
    if (!publication) return;
    const next = publication.showGlossary === false;
    setUpdatingShowGlossary(true);
    try {
      await api.updatePublicationDisplaySettings(publication.id, {
        showGlossary: next,
      });
      setPublication((p) => (p ? { ...p, showGlossary: next } : null));
    } catch (error) {
      onError(
        t('projectInfo.publishError'),
        error instanceof Error ? error.message : t('projectInfo.publishError')
      );
    } finally {
      setUpdatingShowGlossary(false);
    }
  }, [publication, setPublication, onError, t]);

  return (
    <div class="publication-section" style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
      <div class="metadata-header" style={{ marginBottom: '0.75rem' }}>
        <span class="metadata-icon">
          <Icon name="campaign" size="sm" />
        </span>
        <h3 class="metadata-title">{t('projectInfo.publicationTitle')}</h3>
      </div>
      <div class="metadata-item metadata-source-url" style={{ marginBottom: '0.75rem' }}>
        <span class="metadata-label">{t('projectInfo.sourceUrlLabel')}</span>
        {editingSourceUrl ? (
          <div class="project-description-editor">
            <input
              ref={sourceUrlInputRef}
              type="url"
              class="form-input"
              value={sourceUrlDraft}
              onInput={(e) => setSourceUrlDraft((e.target as HTMLInputElement).value)}
              onKeyDown={handleSourceUrlKeyDown}
              placeholder={t('projectInfo.sourceUrlPlaceholder')}
            />
            <div class="project-description-actions">
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                onClick={cancelEditingSourceUrl}
                disabled={savingSourceUrl}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                class="btn btn-primary btn-sm"
                onClick={() => void saveSourceUrl()}
                disabled={savingSourceUrl}
              >
                {savingSourceUrl ? '...' : t('common.save')}
              </button>
            </div>
          </div>
        ) : (
          <div
            class={`metadata-value description-text editable ${!project.metadata?.sourceUrl ? 'empty' : ''}`}
            onClick={startEditingSourceUrl}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && startEditingSourceUrl()}
          >
            {project.metadata?.sourceUrl
              ? project.metadata.sourceUrl
              : t('projectInfo.clickToAddSourceUrl')}
          </div>
        )}
      </div>
      {publicationLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <LoadingSpinner size="sm" text={t('common.loading')} />
        </div>
      ) : publication?.status === 'published' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {t('projectInfo.publicationPublished')}
          </p>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-dim)' }}>
            {t('projectInfo.publicationUpdatesHint')}
          </p>
          {stats.glossary > 0 && (
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                cursor: 'pointer',
                marginBottom: '0.25rem',
              }}
            >
              <input
                type="checkbox"
                checked={publication.showGlossary !== false}
                disabled={updatingShowGlossary}
                onChange={() => void handleShowGlossaryChange()}
                style={{
                  width: '18px',
                  height: '18px',
                  marginTop: '2px',
                  cursor: updatingShowGlossary ? 'wait' : 'pointer',
                }}
                aria-label={t('projectInfo.showGlossaryToReaders')}
              />
              <div>
                <div style={{ fontWeight: 500 }}>{t('projectInfo.showGlossaryToReaders')}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  {t('projectInfo.showGlossaryHint')}
                </div>
              </div>
            </label>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.open(`/p/${publication.slug || publication.id}`, '_blank')}
            >
              {t('projectInfo.publicationView')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onUpdatePublication}
              disabled={updatingPublication || !hasPublishableTranslator}
            >
              {updatingPublication ? t('common.loading') : t('projectInfo.updatePublication')}
            </Button>
            {stats.translated > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onBuildExports}
                disabled={buildingExports}
              >
                {buildingExports
                  ? t('common.loading')
                  : publication.epubStoragePath || publication.fb2StoragePath
                    ? t('publication.updateExports')
                    : t('publication.prepareExports')}
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={onUnpublishRequest}
              disabled={unpublishing}
            >
              {unpublishing ? t('common.loading') : t('projectInfo.unpublish')}
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {t('projectInfo.publicationNotPublished')}
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={onOpenPublishModal}
            disabled={stats.chapters === 0}
          >
            {t('projectInfo.publish')}
          </Button>
          {stats.chapters === 0 && (
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-dim)' }}>
              {t('projectInfo.publishRequiresChapters')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
