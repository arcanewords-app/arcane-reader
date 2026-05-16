import { useState, useRef, useCallback, useEffect } from 'preact/hooks';
import { useTranslation, Trans } from 'react-i18next';
import type {
  Project,
  ProjectWithChapterList,
  ProjectSettings,
  Chapter,
  Publication,
  PublicEntity,
} from '../types';
import { Card, Button, Modal, Input, LoadingSpinner, Icon, AlertModal, ConfirmModal } from './ui';
import { EntityCard, TagChip, EntityPickerModal } from './EntityCard';
import { api, ApiError } from '../api/client';
import { authService } from '../services/authService';
import { isChunkError } from '../../shared/chunkErrors';
import { invalidateProject } from '../store/projects';
import '../components/ChapterView/ReaderSettings.css';
import './ProjectInfo.css';

interface ProjectInfoProps {
  project: Project | ProjectWithChapterList;
  onSettingsChange: (settings: ProjectSettings) => void;
  onDelete: () => void;
  onRefreshProject: () => Promise<void>;
  onEnterReadingMode: () => void;
}

export function ProjectInfo({
  project,
  onDelete,
  onRefreshProject,
  onEnterReadingMode,
}: ProjectInfoProps) {
  const { t } = useTranslation();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);
  const [showUnpublishConfirm, setShowUnpublishConfirm] = useState(false);
  const [showDeleteCoverConfirm, setShowDeleteCoverConfirm] = useState(false);
  const [buildingExports, setBuildingExports] = useState(false);
  const [buildExportsOnPublish, setBuildExportsOnPublish] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [deletingCover, setDeletingCover] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [savingDescription, setSavingDescription] = useState(false);
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Publication (catalog)
  const [publication, setPublication] = useState<Publication | null>(null);
  const [publicationLoading, setPublicationLoading] = useState(true);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [updatingPublication, setUpdatingPublication] = useState(false);
  const [updatingShowGlossary, setUpdatingShowGlossary] = useState(false);
  const [publishTitle, setPublishTitle] = useState('');
  const [publishDescription, setPublishDescription] = useState('');

  // Entity section (author, translator, tags)
  const [authorEntity, setAuthorEntity] = useState<PublicEntity | null>(null);
  const [translatorEntity, setTranslatorEntity] = useState<PublicEntity | null>(null);
  const [tagEntities, setTagEntities] = useState<PublicEntity[]>([]);
  const [showAuthorPicker, setShowAuthorPicker] = useState(false);
  const [showTranslatorPicker, setShowTranslatorPicker] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [savingEntities, setSavingEntities] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Load publication in background with retry logic, don't block on errors
    const loadPublicationWithRetry = async (retries = 2) => {
      try {
        const pub = await api.getProjectPublication(project.id);
        if (!cancelled) {
          setPublication(pub ?? null);
        }
      } catch (error) {
        // If retries left, try again after a delay
        if (retries > 0) {
          setTimeout(
            () => {
              if (!cancelled) {
                loadPublicationWithRetry(retries - 1);
              }
            },
            1000 + Math.random() * 1000
          ); // 1-2s delay + jitter
        } else {
          // After all retries, just set to null and move on
          if (!cancelled) {
            console.warn('Failed to load publication after retries:', error);
            setPublication(null);
          }
        }
      } finally {
        if (!cancelled) {
          setPublicationLoading(false);
        }
      }
    };

    // Delay initial load slightly to not compete with main project loading
    const loadTimer = setTimeout(() => {
      if (!cancelled) {
        loadPublicationWithRetry();
      }
    }, 500); // Small delay after project loads

    return () => {
      cancelled = true;
      clearTimeout(loadTimer);
    };
  }, [project.id]);

  // Load entity details when project has entity IDs
  useEffect(() => {
    let cancelled = false;
    const loadEntities = async () => {
      const authorId = project.metadata?.authorEntityId;
      const translatorId = project.metadata?.translatorEntityId;
      const tagIds = project.metadata?.tagEntityIds ?? [];
      if (!authorId && !translatorId && tagIds.length === 0) {
        setAuthorEntity(null);
        setTranslatorEntity(null);
        setTagEntities([]);
        return;
      }
      const [author, translator, ...tags] = await Promise.all([
        authorId ? api.getPublicEntityById(authorId) : Promise.resolve(null),
        translatorId ? api.getPublicEntityById(translatorId) : Promise.resolve(null),
        ...tagIds.map((id) => api.getPublicEntityById(id)),
      ]);
      if (!cancelled) {
        setAuthorEntity(author ?? null);
        setTranslatorEntity(translator ?? null);
        setTagEntities(tags.filter((e): e is PublicEntity => e != null));
      }
    };
    loadEntities();
    return () => {
      cancelled = true;
    };
  }, [
    project.metadata?.authorEntityId,
    project.metadata?.translatorEntityId,
    project.metadata?.tagEntityIds,
  ]);

  const saveEntityMetadata = useCallback(
    async (updates: {
      authorEntityId?: string | null;
      translatorEntityId?: string | null;
      tagEntityIds?: string[];
    }) => {
      setSavingEntities(true);
      try {
        await api.updateProjectMetadata(project.id, {
          ...project.metadata,
          ...updates,
        });
        invalidateProject(project.id);
        await onRefreshProject();
      } catch (error) {
        setErrorModal({
          title: t('projectInfo.errorSaveDescription'),
          message: error instanceof Error ? error.message : t('projectInfo.errorSaveDescription'),
        });
      } finally {
        setSavingEntities(false);
      }
    },
    [project.id, project.metadata, onRefreshProject, t]
  );

  const handleAuthorSelect = useCallback(
    (entities: PublicEntity[]) => {
      const entity = entities[0];
      if (entity) {
        setAuthorEntity(entity);
        saveEntityMetadata({ authorEntityId: entity.id });
      }
      setShowAuthorPicker(false);
    },
    [saveEntityMetadata]
  );

  const handleTranslatorSelect = useCallback(
    (entities: PublicEntity[]) => {
      const entity = entities[0];
      if (entity) {
        setTranslatorEntity(entity);
        saveEntityMetadata({ translatorEntityId: entity.id });
      }
      setShowTranslatorPicker(false);
    },
    [saveEntityMetadata]
  );

  const handleTagSelect = useCallback(
    (entities: PublicEntity[]) => {
      setTagEntities(entities);
      saveEntityMetadata({ tagEntityIds: entities.map((e) => e.id) });
      setShowTagPicker(false);
    },
    [saveEntityMetadata]
  );

  const handleRemoveAuthor = useCallback(() => {
    setAuthorEntity(null);
    saveEntityMetadata({ authorEntityId: null });
  }, [saveEntityMetadata]);

  const handleRemoveTranslator = useCallback(() => {
    setTranslatorEntity(null);
    saveEntityMetadata({ translatorEntityId: null });
  }, [saveEntityMetadata]);

  const handleRemoveTag = useCallback(
    (entity: PublicEntity) => {
      const nextTags = tagEntities.filter((e) => e.id !== entity.id);
      setTagEntities(nextTags);
      saveEntityMetadata({ tagEntityIds: nextTags.map((e) => e.id) });
    },
    [tagEntities, saveEntityMetadata]
  );

  const openPublishModal = useCallback(() => {
    setPublishTitle(project.metadata?.title ?? project.name);
    setPublishDescription(project.metadata?.description ?? '');
    setBuildExportsOnPublish(false);
    setShowPublishModal(true);
  }, [project.metadata?.title, project.metadata?.description, project.name]);

  // Helper: chapter has valid translation (works with Chapter or ChapterListItem)
  const hasValidTranslation = (
    chapter:
      | Chapter
      | {
          status: string;
          hasTranslation?: boolean;
          translatedText?: string;
          paragraphs?: Array<{ translatedText?: string }>;
        }
  ): boolean => {
    if ('hasTranslation' in chapter && chapter.hasTranslation) return true;
    if (chapter.status === 'completed' || chapter.status === 'draft') return true;
    const ch = chapter as Chapter;
    const translatedText = ch.translatedText?.trim() || '';
    if (translatedText.length === 0) return false;
    if (translatedText.startsWith('❌') || isChunkError(translatedText)) return false;
    const hasValidParagraphs = ch.paragraphs?.some((p) => {
      const pText = p.translatedText?.trim() || '';
      return pText.length > 0 && !pText.startsWith('❌') && !isChunkError(pText);
    });
    return hasValidParagraphs === true || translatedText.length > 50;
  };

  const stats = {
    chapters: project.chapters.length,
    translated: project.chapters.filter((c) => c.status === 'completed').length,
    pending: project.chapters.filter((c) => c.status === 'pending').length,
    analyzed: project.chapters.filter((c) => c.status === 'analyzed').length,
    error: project.chapters.filter((c) => c.status === 'error').length,
    empty: project.chapters.filter((c) => !hasValidTranslation(c)).length,
    glossary: project.glossary.length,
  };

  const handlePublish = useCallback(async () => {
    setPublishing(true);
    try {
      const pub = await api.publishProject(project.id, {
        status: 'published',
        title: publishTitle.trim() || undefined,
        description: publishDescription.trim() || undefined,
        authorDisplay: authorEntity ? undefined : (project.metadata?.authors?.[0] ?? undefined),
        translatorDisplay: translatorEntity
          ? undefined
          : (authService.getCachedUser()?.email ?? undefined),
        authorEntityId: project.metadata?.authorEntityId ?? undefined,
        translatorEntityId: project.metadata?.translatorEntityId ?? undefined,
        tagEntityIds: project.metadata?.tagEntityIds ?? undefined,
      });
      setPublication(pub);
      setShowPublishModal(false);
      if (buildExportsOnPublish && pub && stats.translated > 0) {
        setBuildingExports(true);
        try {
          await api.buildPublicationExports(pub.id);
          const refreshed = await api.getProjectPublication(project.id);
          if (refreshed) setPublication(refreshed);
        } catch {
          setErrorModal({
            title: t('projectInfo.exportError', { format: 'EPUB/FB2' }),
            message: t('publication.buildExportsError'),
          });
        } finally {
          setBuildingExports(false);
        }
      }
    } catch (error) {
      setErrorModal({
        title: t('projectInfo.publishError'),
        message: error instanceof Error ? error.message : t('projectInfo.publishError'),
      });
    } finally {
      setPublishing(false);
    }
  }, [
    project.id,
    project.metadata?.authorEntityId,
    project.metadata?.translatorEntityId,
    project.metadata?.tagEntityIds,
    project.metadata?.authors,
    authorEntity,
    translatorEntity,
    publishTitle,
    publishDescription,
    buildExportsOnPublish,
    stats.translated,
    t,
  ]);

  const handleUnpublish = useCallback(async () => {
    setUnpublishing(true);
    try {
      await api.unpublishProject(project.id);
      setPublication(null);
    } catch (error) {
      setErrorModal({
        title: t('projectInfo.unpublishError'),
        message: error instanceof Error ? error.message : t('projectInfo.unpublishError'),
      });
    } finally {
      setUnpublishing(false);
    }
  }, [project.id, t]);

  const handleBuildExports = useCallback(async () => {
    if (!publication) return;
    setBuildingExports(true);
    try {
      await api.buildPublicationExports(publication.id);
      const refreshed = await api.getProjectPublication(project.id);
      if (refreshed) setPublication(refreshed);
    } catch (error) {
      setErrorModal({
        title: t('projectInfo.exportError', { format: 'EPUB/FB2' }),
        message: error instanceof Error ? error.message : t('publication.buildExportsError'),
      });
    } finally {
      setBuildingExports(false);
    }
  }, [publication, project.id, t]);

  const handleUpdatePublication = useCallback(async () => {
    setUpdatingPublication(true);
    try {
      const pub = await api.publishProject(project.id, {
        status: 'published',
        title: project.metadata?.title ?? project.name,
        description: project.metadata?.description ?? undefined,
        authorDisplay: authorEntity ? undefined : (project.metadata?.authors?.[0] ?? undefined),
        translatorDisplay: translatorEntity
          ? undefined
          : (authService.getCachedUser()?.email ?? undefined),
        coverImageUrl: project.metadata?.coverImageUrl ?? undefined,
        authorEntityId: project.metadata?.authorEntityId ?? undefined,
        translatorEntityId: project.metadata?.translatorEntityId ?? undefined,
        tagEntityIds: project.metadata?.tagEntityIds ?? undefined,
      });
      setPublication(pub);
    } catch (error) {
      setErrorModal({
        title: t('projectInfo.publishError'),
        message: error instanceof Error ? error.message : t('projectInfo.publishError'),
      });
    } finally {
      setUpdatingPublication(false);
    }
  }, [
    project.id,
    project.metadata?.title,
    project.metadata?.description,
    project.metadata?.authors,
    project.metadata?.coverImageUrl,
    project.metadata?.authorEntityId,
    project.metadata?.translatorEntityId,
    project.metadata?.tagEntityIds,
    project.name,
    authorEntity,
    translatorEntity,
    t,
  ]);

  const startEditingDescription = useCallback(() => {
    setDescriptionDraft(project.metadata?.description ?? '');
    setEditingDescription(true);
    setTimeout(() => descriptionTextareaRef.current?.focus(), 0);
  }, [project.metadata?.description]);

  const cancelEditingDescription = useCallback(() => {
    setEditingDescription(false);
    setDescriptionDraft('');
  }, []);

  const saveDescription = useCallback(async () => {
    setSavingDescription(true);
    try {
      await api.updateProjectMetadata(project.id, {
        ...project.metadata,
        description: descriptionDraft.trim() || undefined,
      });
      invalidateProject(project.id);
      await onRefreshProject();
      setEditingDescription(false);
      setDescriptionDraft('');
    } catch (error) {
      setErrorModal({
        title: t('projectInfo.errorSaveDescription'),
        message: error instanceof Error ? error.message : t('projectInfo.errorSaveDescription'),
      });
    } finally {
      setSavingDescription(false);
    }
  }, [project.id, project.metadata, descriptionDraft, onRefreshProject, t]);

  const handleDescriptionKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveDescription();
      } else if (e.key === 'Escape') {
        cancelEditingDescription();
      }
    },
    [saveDescription, cancelEditingDescription]
  );

  const settings = project.settings;

  const isOriginalReadingMode = settings.originalReadingMode ?? false;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteProject(project.id);
      setShowDeleteModal(false);
      onDelete();
    } catch (error) {
      // Ignore 401 errors - they are handled globally and will show login page
      if (error instanceof ApiError && error.status === 401) {
        // Auth error - handled globally
        return;
      }
      console.error('Failed to delete project:', error);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCover = useCallback(async () => {
    setDeletingCover(true);
    try {
      await api.deleteProjectCover(project.id);
      invalidateProject(project.id);
      await onRefreshProject();
    } catch (error) {
      console.error('Failed to delete cover:', error);
      setErrorModal({
        title: t('projectInfo.errorDeleteCover'),
        message: error instanceof Error ? error.message : t('projectInfo.errorDeleteCover'),
      });
    } finally {
      setDeletingCover(false);
    }
  }, [project.id, onRefreshProject, t]);

  return (
    <>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{project.name}</h2>
            <span style={{ color: 'var(--text-dim)' }}>
              {isOriginalReadingMode ? t('projectInfo.originalReading') : t('projectInfo.enToRu')}
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setShowDeleteModal(true)}>
            {t('projectInfo.delete')}
          </Button>
        </div>

        <div class="stats">
          <div class="stat-item">
            <div class="stat-value">{stats.chapters}</div>
            <div class="stat-label">{t('projectInfo.chaptersLabel')}</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">{stats.translated}</div>
            <div class="stat-label">{t('projectInfo.translatedLabel')}</div>
          </div>
          {stats.analyzed > 0 && (
            <div class="stat-item" style={{ color: 'var(--accent)' }}>
              <div class="stat-value">{stats.analyzed}</div>
              <div class="stat-label">{t('projectInfo.analyzedLabel', 'Анализ')}</div>
            </div>
          )}
          {stats.error > 0 && (
            <div class="stat-item" style={{ color: 'var(--error)' }}>
              <div class="stat-value">{stats.error}</div>
              <div class="stat-label">{t('projectInfo.errorsLabel')}</div>
            </div>
          )}
          <div class="stat-item">
            <div class="stat-value">{stats.glossary}</div>
            <div class="stat-label">{t('projectInfo.inGlossaryLabel')}</div>
          </div>
        </div>

        {/* Book Metadata Section - only for 'book' type */}
        {project.type === 'book' &&
          project.metadata &&
          Object.keys(project.metadata).length > 0 && (
            <div class="book-metadata-section">
              <div class="metadata-header">
                <span class="metadata-icon">
                  <Icon name="menu_book" size="sm" />
                </span>
                <h3 class="metadata-title">{t('projectInfo.bookInfo')}</h3>
              </div>
              <div class="metadata-content">
                {/* Cover Image */}
                <div
                  class="metadata-cover"
                  role="button"
                  tabIndex={0}
                  aria-label={
                    project.metadata?.coverImageUrl ? undefined : t('projectInfo.uploadCoverClick')
                  }
                  style={{
                    cursor: project.metadata?.coverImageUrl ? 'default' : 'pointer',
                    position: 'relative',
                  }}
                  onClick={() => {
                    if (!project.metadata?.coverImageUrl && !uploadingCover && !deletingCover) {
                      const input = document.getElementById(
                        'cover-upload-input'
                      ) as HTMLInputElement;
                      input?.click();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (!project.metadata?.coverImageUrl && !uploadingCover && !deletingCover) {
                        const input = document.getElementById(
                          'cover-upload-input'
                        ) as HTMLInputElement;
                        input?.click();
                      }
                    }
                  }}
                >
                  {project.metadata?.coverImageUrl ? (
                    <>
                      <img
                        src={project.metadata.coverImageUrl}
                        alt={t('projectInfo.coverAlt')}
                        class="cover-image"
                      />
                      {deletingCover ? (
                        <div
                          style={{
                            position: 'absolute',
                            top: '0.5rem',
                            right: '0.5rem',
                            background: 'rgba(0, 0, 0, 0.7)',
                            borderRadius: '4px',
                            padding: '0.25rem 0.5rem',
                            color: 'white',
                            fontSize: '0.85rem',
                          }}
                        >
                          ...
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDeleteCoverConfirm(true);
                            }}
                            disabled={deletingCover}
                            style={{
                              position: 'absolute',
                              top: '0.5rem',
                              right: '0.5rem',
                              background: 'rgba(255, 255, 255, 0.9)',
                              border: '1px solid var(--border)',
                              borderRadius: '4px',
                              width: '32px',
                              height: '32px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '1rem',
                              transition: 'all 0.2s',
                            }}
                            title={t('projectInfo.deleteCoverTitle')}
                          >
                            <Icon name="delete" size="sm" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const input = document.getElementById(
                                'cover-upload-input'
                              ) as HTMLInputElement;
                              input?.click();
                            }}
                            disabled={uploadingCover || deletingCover}
                            style={{
                              position: 'absolute',
                              bottom: '0.5rem',
                              right: '0.5rem',
                              background: 'rgba(255, 255, 255, 0.9)',
                              border: '1px solid var(--border)',
                              borderRadius: '4px',
                              padding: '0.375rem 0.75rem',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              transition: 'all 0.2s',
                            }}
                            title={t('projectInfo.replaceCoverTitle')}
                          >
                            {uploadingCover ? (
                              <Icon name="schedule" size="sm" />
                            ) : (
                              <Icon name="upload_file" size="sm" />
                            )}
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        minHeight: '300px',
                        background: 'var(--bg-hover)',
                        border: '2px dashed var(--border)',
                        borderRadius: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.75rem',
                        transition: 'all 0.2s',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        if (!uploadingCover && !deletingCover) {
                          e.currentTarget.style.borderColor = 'var(--accent)';
                          e.currentTarget.style.background = 'var(--accent-glow)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border)';
                        e.currentTarget.style.background = 'var(--bg-hover)';
                      }}
                    >
                      <div style={{ fontSize: '3rem', opacity: 0.5 }}>
                        <Icon name="image" size="lg" />
                      </div>
                      <div
                        style={{
                          fontSize: '0.9rem',
                          color: 'var(--text-secondary)',
                          textAlign: 'center',
                          padding: '0 1rem',
                        }}
                      >
                        {uploadingCover
                          ? `... ${t('projectInfo.uploadCoverLoading')}`
                          : t('projectInfo.uploadCoverClick')}
                      </div>
                    </div>
                  )}
                </div>

                <div class="metadata-details">
                  {/* Title */}
                  {project.metadata.title && project.metadata.title !== project.name && (
                    <div class="metadata-item">
                      <span class="metadata-label">{t('projectInfo.title')}</span>
                      <span class="metadata-value">{project.metadata.title}</span>
                    </div>
                  )}

                  {/* Authors */}
                  {project.metadata.authors && project.metadata.authors.length > 0 && (
                    <div class="metadata-item">
                      <span class="metadata-label">{t('projectInfo.authors')}</span>
                      <span class="metadata-value">{project.metadata.authors.join(', ')}</span>
                    </div>
                  )}

                  {/* Language */}
                  {project.metadata.language && (
                    <div class="metadata-item">
                      <span class="metadata-label">{t('projectInfo.sourceLanguage')}</span>
                      <span class="metadata-value">{project.metadata.language.toUpperCase()}</span>
                    </div>
                  )}

                  {/* Publisher */}
                  {project.metadata.publisher && (
                    <div class="metadata-item">
                      <span class="metadata-label">{t('projectInfo.publisher')}</span>
                      <span class="metadata-value">{project.metadata.publisher}</span>
                    </div>
                  )}

                  {/* Series */}
                  {project.metadata.series && (
                    <div class="metadata-item">
                      <span class="metadata-label">{t('projectInfo.series')}</span>
                      <span class="metadata-value">
                        {project.metadata.series}
                        {project.metadata.seriesNumber &&
                          ` (${t('projectInfo.bookInSeries', { n: project.metadata.seriesNumber })})`}
                      </span>
                    </div>
                  )}

                  {/* ISBN */}
                  {project.metadata.isbn && (
                    <div class="metadata-item">
                      <span class="metadata-label">{t('projectInfo.isbn')}</span>
                      <span class="metadata-value">{project.metadata.isbn}</span>
                    </div>
                  )}

                  {/* Published Date */}
                  {project.metadata.publishedDate && (
                    <div class="metadata-item">
                      <span class="metadata-label">{t('projectInfo.publishedDate')}</span>
                      <span class="metadata-value">
                        {new Date(project.metadata.publishedDate).toLocaleDateString('ru-RU', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  )}

                  {/* Description - editable */}
                  <div class="metadata-item metadata-description">
                    <span class="metadata-label">{t('projectInfo.description')}</span>
                    {editingDescription ? (
                      <div class="project-description-editor">
                        <textarea
                          ref={descriptionTextareaRef}
                          class="project-description-textarea"
                          value={descriptionDraft}
                          onInput={(e) =>
                            setDescriptionDraft((e.target as HTMLTextAreaElement).value)
                          }
                          onKeyDown={handleDescriptionKeyDown}
                          placeholder={t('projectInfo.addDescriptionPlaceholder')}
                          rows={4}
                        />
                        <div class="project-description-actions">
                          <button
                            type="button"
                            class="btn btn-secondary btn-sm"
                            onClick={cancelEditingDescription}
                            disabled={savingDescription}
                          >
                            {t('common.cancel')}
                          </button>
                          <button
                            type="button"
                            class="btn btn-primary btn-sm"
                            onClick={saveDescription}
                            disabled={savingDescription}
                          >
                            {savingDescription ? '...' : t('common.save')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        class={`metadata-value description-text editable ${!project.metadata?.description ? 'empty' : ''}`}
                        onClick={startEditingDescription}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && startEditingDescription()}
                      >
                        {project.metadata?.description
                          ? project.metadata.description
                          : t('projectInfo.clickToAddDescription')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

        {/* Cover Image Section - for non-book projects or projects without metadata */}
        {(!project.type ||
          project.type !== 'book' ||
          !project.metadata ||
          Object.keys(project.metadata).length === 0) && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3
              style={{
                fontSize: '1rem',
                fontWeight: 600,
                marginBottom: '0.75rem',
                color: 'var(--text-primary)',
              }}
            >
              {t('projectInfo.coverAndDescription')}
            </h3>
            <div
              class="metadata-content"
              style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}
            >
              <div
                class="metadata-cover"
                role="button"
                tabIndex={0}
                aria-label={
                  project.metadata?.coverImageUrl ? undefined : t('projectInfo.uploadCoverClick')
                }
                style={{
                  position: 'relative',
                  flexShrink: 0,
                  cursor: project.metadata?.coverImageUrl ? 'default' : 'pointer',
                }}
                onClick={() => {
                  if (!project.metadata?.coverImageUrl && !uploadingCover && !deletingCover) {
                    const input = document.getElementById('cover-upload-input') as HTMLInputElement;
                    input?.click();
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (!project.metadata?.coverImageUrl && !uploadingCover && !deletingCover) {
                      const input = document.getElementById(
                        'cover-upload-input'
                      ) as HTMLInputElement;
                      input?.click();
                    }
                  }
                }}
              >
                {project.metadata?.coverImageUrl ? (
                  <>
                    <img
                      src={project.metadata.coverImageUrl}
                      alt={t('projectInfo.coverProjectAlt')}
                      style={{
                        width: '100%',
                        maxWidth: '200px',
                        height: 'auto',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                      }}
                    />
                    {deletingCover ? (
                      <div
                        style={{
                          position: 'absolute',
                          top: '0.5rem',
                          right: '0.5rem',
                          background: 'rgba(0, 0, 0, 0.7)',
                          borderRadius: '4px',
                          padding: '0.25rem 0.5rem',
                          color: 'white',
                          fontSize: '0.85rem',
                        }}
                      >
                        ...
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDeleteCoverConfirm(true);
                          }}
                          disabled={deletingCover}
                          style={{
                            position: 'absolute',
                            top: '0.5rem',
                            right: '0.5rem',
                            background: 'rgba(255, 255, 255, 0.9)',
                            border: '1px solid var(--border)',
                            borderRadius: '4px',
                            width: '32px',
                            height: '32px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1rem',
                            transition: 'all 0.2s',
                          }}
                          title={t('projectInfo.deleteCoverTitle')}
                        >
                          <Icon name="delete" size="sm" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const input = document.getElementById(
                              'cover-upload-input'
                            ) as HTMLInputElement;
                            input?.click();
                          }}
                          disabled={uploadingCover || deletingCover}
                          style={{
                            position: 'absolute',
                            bottom: '0.5rem',
                            right: '0.5rem',
                            background: 'rgba(255, 255, 255, 0.9)',
                            border: '1px solid var(--border)',
                            borderRadius: '4px',
                            padding: '0.375rem 0.75rem',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            transition: 'all 0.2s',
                          }}
                          title={t('projectInfo.replaceCoverTitle')}
                        >
                          {uploadingCover ? (
                            <Icon name="schedule" size="sm" />
                          ) : (
                            <Icon name="upload_file" size="sm" />
                          )}
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <div
                    style={{
                      width: '200px',
                      height: '300px',
                      background: 'var(--bg-hover)',
                      border: '2px dashed var(--border)',
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.75rem',
                      transition: 'all 0.2s',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      if (!uploadingCover && !deletingCover) {
                        e.currentTarget.style.borderColor = 'var(--accent)';
                        e.currentTarget.style.background = 'var(--accent-glow)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.background = 'var(--bg-hover)';
                    }}
                  >
                    <div style={{ fontSize: '3rem', opacity: 0.5 }}>
                      <Icon name="image" size="lg" />
                    </div>
                    <div
                      style={{
                        fontSize: '0.9rem',
                        color: 'var(--text-secondary)',
                        textAlign: 'center',
                        padding: '0 1rem',
                      }}
                    >
                      {uploadingCover
                        ? `... ${t('projectInfo.uploadCoverLoading')}`
                        : t('projectInfo.uploadCoverClick')}
                    </div>
                  </div>
                )}
              </div>
              {/* Description - editable, next to cover */}
              <div class="metadata-details" style={{ flex: 1, minWidth: '200px' }}>
                <div class="metadata-item metadata-description">
                  <span class="metadata-label">{t('projectInfo.projectDescription')}</span>
                  {editingDescription ? (
                    <div class="project-description-editor">
                      <textarea
                        ref={descriptionTextareaRef}
                        class="project-description-textarea"
                        value={descriptionDraft}
                        onInput={(e) =>
                          setDescriptionDraft((e.target as HTMLTextAreaElement).value)
                        }
                        onKeyDown={handleDescriptionKeyDown}
                        placeholder={t('projectInfo.addDescriptionPlaceholder')}
                        rows={4}
                      />
                      <div class="project-description-actions">
                        <button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          onClick={cancelEditingDescription}
                          disabled={savingDescription}
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          type="button"
                          class="btn btn-primary btn-sm"
                          onClick={saveDescription}
                          disabled={savingDescription}
                        >
                          {savingDescription ? '...' : t('common.save')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      class={`metadata-value description-text editable ${!project.metadata?.description ? 'empty' : ''}`}
                      onClick={startEditingDescription}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && startEditingDescription()}
                    >
                      {project.metadata?.description
                        ? project.metadata.description
                        : t('projectInfo.clickToAddDescription')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Entity Section: Author, Translator, Tags */}
        <div class="entity-section" style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
          <div class="metadata-header" style={{ marginBottom: '0.75rem' }}>
            <span class="metadata-icon">
              <Icon name="person" size="sm" />
            </span>
            <h3 class="metadata-title">{t('projectInfo.entitySectionTitle')}</h3>
          </div>
          <div class="entity-section__content">
            <div class="entity-section__row">
              <span class="entity-section__label">{t('projectInfo.author')}</span>
              <div class="entity-section__value">
                {authorEntity ? (
                  <div class="entity-section__card-wrap">
                    <EntityCard entity={authorEntity} compact />
                    <button
                      type="button"
                      class="entity-section__remove"
                      onClick={handleRemoveAuthor}
                      disabled={savingEntities}
                      aria-label={t('projectInfo.removeAuthor')}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowAuthorPicker(true)}
                    disabled={savingEntities}
                  >
                    {t('projectInfo.selectAuthor')}
                  </Button>
                )}
              </div>
            </div>
            <div class="entity-section__row">
              <span class="entity-section__label">{t('projectInfo.translator')}</span>
              <div class="entity-section__value">
                {translatorEntity ? (
                  <div class="entity-section__card-wrap">
                    <EntityCard entity={translatorEntity} compact />
                    <button
                      type="button"
                      class="entity-section__remove"
                      onClick={handleRemoveTranslator}
                      disabled={savingEntities}
                      aria-label={t('projectInfo.removeTranslator')}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowTranslatorPicker(true)}
                    disabled={savingEntities}
                  >
                    {t('projectInfo.selectTranslator')}
                  </Button>
                )}
              </div>
            </div>
            <div class="entity-section__row">
              <span class="entity-section__label">{t('projectInfo.tags')}</span>
              <div class="entity-section__value entity-section__tags">
                {tagEntities.map((entity) => (
                  <TagChip
                    key={entity.id}
                    entity={entity}
                    removable
                    onRemove={() => handleRemoveTag(entity)}
                  />
                ))}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowTagPicker(true)}
                  disabled={savingEntities}
                >
                  {t('projectInfo.addTags')}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <EntityPickerModal
          isOpen={showAuthorPicker}
          onClose={() => setShowAuthorPicker(false)}
          kind="author"
          mode="single"
          selectedIds={authorEntity ? [authorEntity.id] : []}
          onSelect={handleAuthorSelect}
        />
        <EntityPickerModal
          isOpen={showTranslatorPicker}
          onClose={() => setShowTranslatorPicker(false)}
          kind="translator"
          mode="single"
          selectedIds={translatorEntity ? [translatorEntity.id] : []}
          onSelect={handleTranslatorSelect}
        />
        <EntityPickerModal
          isOpen={showTagPicker}
          onClose={() => setShowTagPicker(false)}
          kind="tag"
          mode="multi"
          selectedIds={tagEntities.map((e) => e.id)}
          onSelect={handleTagSelect}
        />

        {/* Hidden file input for cover upload */}
        {/* Publication (catalog) */}
        <div class="publication-section" style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
          <div class="metadata-header" style={{ marginBottom: '0.75rem' }}>
            <span class="metadata-icon">
              <Icon name="campaign" size="sm" />
            </span>
            <h3 class="metadata-title">{t('projectInfo.publicationTitle')}</h3>
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
                    onChange={async () => {
                      if (!publication) return;
                      const next = publication.showGlossary === false;
                      setUpdatingShowGlossary(true);
                      try {
                        await api.updatePublicationDisplaySettings(publication.id, {
                          showGlossary: next,
                        });
                        setPublication((p) => (p ? { ...p, showGlossary: next } : null));
                      } catch (error) {
                        setErrorModal({
                          title: t('projectInfo.publishError'),
                          message:
                            error instanceof Error ? error.message : t('projectInfo.publishError'),
                        });
                      } finally {
                        setUpdatingShowGlossary(false);
                      }
                    }}
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
                  onClick={handleUpdatePublication}
                  disabled={updatingPublication}
                >
                  {updatingPublication ? t('common.loading') : t('projectInfo.updatePublication')}
                </Button>
                {stats.translated > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleBuildExports}
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
                  onClick={() => setShowUnpublishConfirm(true)}
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
                onClick={openPublishModal}
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

        <input
          id="cover-upload-input"
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            setUploadingCover(true);
            try {
              const result = await api.uploadProjectCover(project.id, file);
              invalidateProject(project.id);
              if (result.project) {
                await onRefreshProject();
              } else {
                await onRefreshProject();
              }
            } catch (error) {
              console.error('Failed to upload cover:', error);
              setErrorModal({
                title: t('projectInfo.errorUploadCover'),
                message: error instanceof Error ? error.message : t('projectInfo.errorUploadCover'),
              });
            } finally {
              setUploadingCover(false);
              (e.target as HTMLInputElement).value = '';
            }
          }}
          disabled={uploadingCover || deletingCover}
          style={{ display: 'none' }}
        />

        {/* Translation Statistics - hidden in original reading mode */}
        {!isOriginalReadingMode &&
          (() => {
            const completedChapters = project.chapters.filter(
              (c) => c.status === 'completed' && c.translationMeta
            );
            const totalTokens = completedChapters.reduce(
              (sum, c) => sum + (c.translationMeta?.tokensUsed || 0),
              0
            );
            const totalDuration = completedChapters.reduce(
              (sum, c) => sum + (c.translationMeta?.duration || 0),
              0
            );
            const lastTranslated = completedChapters
              .filter((c) => c.translationMeta?.translatedAt)
              .sort((a, b) => {
                const aDate = a.translationMeta?.translatedAt || '';
                const bDate = b.translationMeta?.translatedAt || '';
                return bDate.localeCompare(aDate);
              })[0];

            if (completedChapters.length > 0) {
              return (
                <div class="translation-stats-section">
                  <div class="metadata-header">
                    <span class="metadata-icon">
                      <Icon name="bar_chart" size="sm" />
                    </span>
                    <h3 class="metadata-title">{t('projectInfo.translationStats')}</h3>
                  </div>
                  <div class="translation-stats-grid">
                    {totalTokens > 0 && (
                      <div class="translation-stat-item">
                        <span class="translation-stat-label">{t('projectInfo.totalTokens')}</span>
                        <span class="translation-stat-value">{totalTokens.toLocaleString()}</span>
                      </div>
                    )}
                    {totalDuration > 0 && (
                      <div class="translation-stat-item">
                        <span class="translation-stat-label">
                          {t('projectInfo.translationTime')}
                        </span>
                        <span class="translation-stat-value">
                          {totalDuration >= 3600000
                            ? `${(totalDuration / 3600000).toFixed(1)} ${t('projectInfo.timeHours')}`
                            : totalDuration >= 60000
                              ? `${(totalDuration / 60000).toFixed(1)} ${t('projectInfo.timeMinutes')}`
                              : `${(totalDuration / 1000).toFixed(0)} ${t('projectInfo.timeSeconds')}`}
                        </span>
                      </div>
                    )}
                    {lastTranslated && (
                      <div class="translation-stat-item">
                        <span class="translation-stat-label">
                          {t('projectInfo.lastTranslation')}
                        </span>
                        <span class="translation-stat-value">
                          {new Date(
                            lastTranslated.translationMeta!.translatedAt
                          ).toLocaleDateString('ru-RU', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    )}
                    <div class="translation-stat-item">
                      <span class="translation-stat-label">{t('projectInfo.created')}</span>
                      <span class="translation-stat-value">
                        {new Date(project.createdAt).toLocaleDateString('ru-RU', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    <div class="translation-stat-item">
                      <span class="translation-stat-label">{t('projectInfo.updated')}</span>
                      <span class="translation-stat-value">
                        {new Date(project.updatedAt).toLocaleDateString('ru-RU', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          })()}

        {/* Reading Mode Button */}
        {isOriginalReadingMode
          ? // In original reading mode: show reading button for all chapters
            stats.chapters > 0 && (
              <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                <Button variant="secondary" size="full" onClick={onEnterReadingMode}>
                  {t('projectInfo.readingChapters', { count: stats.chapters })}
                </Button>
              </div>
            )
          : // In translation mode: show reading button only for translated chapters
            stats.translated > 0 && (
              <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                <Button variant="secondary" size="full" onClick={onEnterReadingMode}>
                  {t('projectInfo.readingModeChapters', { count: stats.translated })}
                </Button>
              </div>
            )}
      </Card>

      {/* Delete Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title={t('projectInfo.deleteProjectConfirm')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleDelete} loading={deleting}>
              {t('projectInfo.delete')}
            </Button>
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)' }}>
          <Trans
            i18nKey="projectInfo.confirmDeleteProject"
            values={{ name: project.name }}
            components={{ strong: <strong /> }}
          />
        </p>
      </Modal>

      {/* Publish to catalog modal */}
      <Modal
        isOpen={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        title={t('projectInfo.publishModalTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowPublishModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handlePublish} loading={publishing}>
              {t('projectInfo.publish')}
            </Button>
          </>
        }
      >
        <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          {t('projectInfo.publishModalHint')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Input
            label={t('projectInfo.publishTitleLabel')}
            value={publishTitle}
            onInput={(e) => setPublishTitle((e.target as HTMLInputElement).value)}
            placeholder={project.name}
          />
          <div>
            <label
              style={{
                display: 'block',
                marginBottom: '0.35rem',
                fontSize: '0.9rem',
                color: 'var(--text-secondary)',
              }}
            >
              {t('projectInfo.publishDescriptionLabel')}
            </label>
            <textarea
              value={publishDescription}
              onInput={(e) => setPublishDescription((e.target as HTMLTextAreaElement).value)}
              placeholder={t('projectInfo.publishDescriptionPlaceholder')}
              rows={3}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                resize: 'vertical',
              }}
            />
          </div>
          {stats.translated > 0 && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.9rem',
                color: 'var(--text-secondary)',
              }}
            >
              <input
                type="checkbox"
                checked={buildExportsOnPublish}
                onChange={(e) => setBuildExportsOnPublish((e.target as HTMLInputElement).checked)}
              />
              {t('projectInfo.buildExportsOnPublish')}
            </label>
          )}
          <div class="publish-modal-entities">
            <div class="publish-modal-entity-row">
              <span class="publish-modal-entity-label">{t('projectInfo.author')}</span>
              <div class="publish-modal-entity-value">
                {authorEntity ? (
                  <>
                    <EntityCard entity={authorEntity} compact />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowAuthorPicker(true)}
                      disabled={savingEntities}
                    >
                      {t('projectInfo.publishChangeAuthor')}
                    </Button>
                  </>
                ) : (
                  <>
                    <span class="publish-modal-not-selected">
                      {t('projectInfo.publishAuthorNotSelected')}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowAuthorPicker(true)}
                      disabled={savingEntities}
                    >
                      {t('projectInfo.publishSelectAuthor')}
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div class="publish-modal-entity-row">
              <span class="publish-modal-entity-label">{t('projectInfo.translator')}</span>
              <div class="publish-modal-entity-value">
                {translatorEntity ? (
                  <>
                    <EntityCard entity={translatorEntity} compact />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowTranslatorPicker(true)}
                      disabled={savingEntities}
                    >
                      {t('projectInfo.publishChangeTranslator')}
                    </Button>
                  </>
                ) : (
                  <>
                    <span class="publish-modal-not-selected">
                      {t('projectInfo.publishTranslatorNotSelected')}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowTranslatorPicker(true)}
                      disabled={savingEntities}
                    >
                      {t('projectInfo.publishSelectTranslator')}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <AlertModal
        isOpen={!!errorModal}
        onClose={() => setErrorModal(null)}
        title={errorModal?.title ?? ''}
        message={errorModal?.message ?? ''}
      />

      <ConfirmModal
        isOpen={showUnpublishConfirm}
        onClose={() => setShowUnpublishConfirm(false)}
        onConfirm={handleUnpublish}
        title={t('projectInfo.unpublishConfirm')}
        message={t('projectInfo.unpublishConfirm')}
        confirmLabel={t('projectInfo.unpublish')}
        variant="danger"
        loading={unpublishing}
      />

      <ConfirmModal
        isOpen={showDeleteCoverConfirm}
        onClose={() => setShowDeleteCoverConfirm(false)}
        onConfirm={handleDeleteCover}
        title={t('projectInfo.deleteCoverConfirm')}
        message={t('projectInfo.deleteCoverConfirm')}
        confirmLabel={t('common.delete')}
        variant="danger"
        loading={deletingCover}
      />
    </>
  );
}
