import { useState, useRef, useCallback, useEffect, useMemo } from 'preact/hooks';
import { useTranslation, Trans } from 'react-i18next';
import { route } from 'preact-router';
import type {
  Project,
  ProjectWithChapterList,
  ProjectSettings,
  Chapter,
  Publication,
  PublicEntity,
  TranslationStatus,
} from '../types';
import { Card, Button, Modal, Input, Icon, AlertModal, ConfirmModal } from './ui';
import { EntityCard } from './EntityCard';
import { ProjectCoverEditor } from './Project/ProjectCoverEditor';
import { ProjectEntitySection } from './Project/ProjectEntitySection';
import { ProjectPublicationSection } from './Project/ProjectPublicationSection';
import { ProjectActionsMenu } from './Project/ProjectActionsMenu';
import { formatLanguagePairLabel } from '../constants/translationLanguages';
import { api, ApiError, clearCatalogLocalCache } from '../api/client';
import { isChunkError } from '../../shared/chunkErrors';
import {
  invalidateProject,
  loadProjects,
  projectsCache,
  updateProjectCache,
} from '../store/projects';
import { useUserRole } from '../hooks/useUserRole';
import { getProjectLimitForRole, isUnlimitedProjectLimit } from '../../config/projectLimits';
import { CopyChaptersModal } from './Project/CopyChaptersModal';
import { BulkDeleteChaptersModal } from './Project/BulkDeleteChaptersModal';
import '../components/ChapterView/ReaderSettings.css';
import './ProjectInfo.css';

interface ProjectInfoProps {
  project: Project | ProjectWithChapterList;
  onSettingsChange: (settings: ProjectSettings) => void;
  onDelete: () => void;
  onRefreshProject: () => Promise<void>;
  onEnterReadingMode: () => void;
  onOpenSettings?: () => void;
}

export function ProjectInfo({
  project,
  onDelete,
  onRefreshProject,
  onEnterReadingMode,
  onOpenSettings,
}: ProjectInfoProps) {
  const { t } = useTranslation();
  const { role, user } = useUserRole();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCopyChaptersModal, setShowCopyChaptersModal] = useState(false);
  const [showBulkDeleteChaptersModal, setShowBulkDeleteChaptersModal] = useState(false);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [cloneName, setCloneName] = useState('');
  const [cloning, setCloning] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameName, setRenameName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);
  const [showUnpublishConfirm, setShowUnpublishConfirm] = useState(false);
  const [showDeleteCoverConfirm, setShowDeleteCoverConfirm] = useState(false);
  const [buildingExports, setBuildingExports] = useState(false);
  const [buildExportsOnPublish, setBuildExportsOnPublish] = useState(false);
  const [deletingCover, setDeletingCover] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [savingDescription, setSavingDescription] = useState(false);
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [editingOriginalTitle, setEditingOriginalTitle] = useState(false);
  const [originalTitleDraft, setOriginalTitleDraft] = useState('');
  const [savingOriginalTitle, setSavingOriginalTitle] = useState(false);
  const originalTitleInputRef = useRef<HTMLInputElement>(null);
  // Publication (catalog)
  const [publication, setPublication] = useState<Publication | null>(null);
  const [publicationLoading, setPublicationLoading] = useState(true);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [updatingPublication, setUpdatingPublication] = useState(false);
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

  const isOwnedTranslatorEntity = useCallback(
    (entity: PublicEntity | null | undefined) =>
      entity != null &&
      user != null &&
      entity.ownerUserId === user.id &&
      (entity.entityStatus ?? 'active') === 'active',
    [user]
  );

  const hasPublishableTranslator = isOwnedTranslatorEntity(translatorEntity);

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

  const languagePairLocked =
    project.glossary.length > 0 || project.chapters.some((c) => c.status !== 'pending');

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
      translationStatus?: TranslationStatus | null;
    }) => {
      setSavingEntities(true);
      try {
        await api.updateProjectMetadata(project.id, {
          ...project.metadata,
          ...updates,
        });
        invalidateProject(project.id);
        if (Object.prototype.hasOwnProperty.call(updates, 'translationStatus')) {
          clearCatalogLocalCache();
          if (publication) {
            setPublication((p) =>
              p ? { ...p, translationStatus: updates.translationStatus ?? null } : null
            );
          }
        }
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
    [project.id, project.metadata, publication, onRefreshProject, t]
  );

  const handleAuthorSelect = useCallback(
    (entities: PublicEntity[]) => {
      const entity = entities[0];
      if (entity) {
        setAuthorEntity(entity);
        saveEntityMetadata({ authorEntityId: entity.id });
      }
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
    },
    [saveEntityMetadata]
  );

  const handleTagSelect = useCallback(
    (entities: PublicEntity[]) => {
      setTagEntities(entities);
      saveEntityMetadata({ tagEntityIds: entities.map((e) => e.id) });
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

  const openPublishModal = useCallback(async () => {
    setPublishTitle(project.metadata?.title ?? project.name);
    setPublishDescription(project.metadata?.description ?? '');
    setBuildExportsOnPublish(false);

    if (!isOwnedTranslatorEntity(translatorEntity)) {
      try {
        const mine = await api.getTranslatorPseudonyms();
        if (mine.length === 1) {
          setTranslatorEntity(mine[0]);
          await saveEntityMetadata({ translatorEntityId: mine[0].id });
        }
      } catch {
        // Non-blocking: user can pick in modal
      }
    }

    setShowPublishModal(true);
  }, [
    project.metadata?.title,
    project.metadata?.description,
    project.name,
    translatorEntity,
    isOwnedTranslatorEntity,
    saveEntityMetadata,
  ]);

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
    if (
      chapter.status === 'completed' ||
      chapter.status === 'draft' ||
      chapter.status === 'partial'
    )
      return true;
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
    partial: project.chapters.filter((c) => c.status === 'partial').length,
    pending: project.chapters.filter((c) => c.status === 'pending').length,
    analyzed: project.chapters.filter((c) => c.status === 'analyzed').length,
    error: project.chapters.filter((c) => c.status === 'error').length,
    empty: project.chapters.filter((c) => !hasValidTranslation(c)).length,
    glossary: project.glossary.length,
  };

  const handlePublish = useCallback(async () => {
    if (!hasPublishableTranslator) {
      setErrorModal({
        title: t('projectInfo.publishError'),
        message: t('translatorPseudonym.publishRequired'),
      });
      return;
    }
    setPublishing(true);
    try {
      const pub = await api.publishProject(project.id, {
        status: 'published',
        title: publishTitle.trim() || undefined,
        description: publishDescription.trim() || undefined,
        authorDisplay: authorEntity ? undefined : (project.metadata?.authors?.[0] ?? undefined),
        authorEntityId: project.metadata?.authorEntityId ?? undefined,
        translatorEntityId: project.metadata?.translatorEntityId ?? undefined,
        tagEntityIds: project.metadata?.tagEntityIds ?? undefined,
        translationStatus: project.metadata?.translationStatus ?? null,
        sourceUrl: project.metadata?.sourceUrl ?? undefined,
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
    project.metadata?.translationStatus,
    project.metadata?.sourceUrl,
    project.metadata?.authors,
    authorEntity,
    publishTitle,
    publishDescription,
    buildExportsOnPublish,
    stats.translated,
    hasPublishableTranslator,
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
    if (!hasPublishableTranslator) {
      setErrorModal({
        title: t('projectInfo.publishError'),
        message: t('translatorPseudonym.publishRequired'),
      });
      return;
    }
    setUpdatingPublication(true);
    try {
      const pub = await api.publishProject(project.id, {
        status: 'published',
        title: publication?.title ?? project.metadata?.title ?? project.name,
        description: project.metadata?.description ?? undefined,
        authorDisplay: authorEntity ? undefined : (project.metadata?.authors?.[0] ?? undefined),
        coverImageUrl: project.metadata?.coverImageUrl ?? undefined,
        authorEntityId: project.metadata?.authorEntityId ?? undefined,
        translatorEntityId: project.metadata?.translatorEntityId ?? undefined,
        tagEntityIds: project.metadata?.tagEntityIds ?? undefined,
        translationStatus: project.metadata?.translationStatus ?? null,
        sourceUrl: publication?.sourceUrl ?? project.metadata?.sourceUrl ?? undefined,
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
    publication?.title,
    project.metadata?.title,
    project.metadata?.description,
    project.metadata?.authors,
    project.metadata?.coverImageUrl,
    project.metadata?.authorEntityId,
    project.metadata?.translatorEntityId,
    project.metadata?.tagEntityIds,
    project.metadata?.translationStatus,
    project.metadata?.sourceUrl,
    publication?.sourceUrl,
    project.name,
    authorEntity,
    hasPublishableTranslator,
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

  const startEditingOriginalTitle = useCallback(() => {
    setOriginalTitleDraft(project.metadata?.title ?? '');
    setEditingOriginalTitle(true);
    setTimeout(() => originalTitleInputRef.current?.focus(), 0);
  }, [project.metadata?.title]);

  const cancelEditingOriginalTitle = useCallback(() => {
    setEditingOriginalTitle(false);
    setOriginalTitleDraft('');
  }, []);

  const saveOriginalTitle = useCallback(async () => {
    setSavingOriginalTitle(true);
    try {
      await api.updateProjectMetadata(project.id, {
        ...project.metadata,
        title: originalTitleDraft.trim() || undefined,
      });
      invalidateProject(project.id);
      await onRefreshProject();
      setEditingOriginalTitle(false);
      setOriginalTitleDraft('');
    } catch (error) {
      setErrorModal({
        title: t('projectInfo.errorSaveOriginalTitle'),
        message: error instanceof Error ? error.message : t('projectInfo.errorSaveOriginalTitle'),
      });
    } finally {
      setSavingOriginalTitle(false);
    }
  }, [project.id, project.metadata, originalTitleDraft, onRefreshProject, t]);

  const handleOriginalTitleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveOriginalTitle();
      } else if (e.key === 'Escape') {
        cancelEditingOriginalTitle();
      }
    },
    [saveOriginalTitle, cancelEditingOriginalTitle]
  );

  const settings = project.settings;

  const isOriginalReadingMode = settings.originalReadingMode ?? false;

  const projectLimit = getProjectLimitForRole(role);
  const projectCount = projectsCache.value.length;
  const atProjectLimit = useMemo(
    () => !isUnlimitedProjectLimit(projectLimit) && projectCount >= projectLimit,
    [projectLimit, projectCount]
  );

  const openCloneModal = () => {
    setCloneName(`${project.name} ${t('projectClone.defaultNameSuffix')}`);
    setShowCloneModal(true);
  };

  const openRenameModal = () => {
    setRenameName(project.name);
    setShowRenameModal(true);
  };

  const handleRename = async () => {
    const trimmed = renameName.trim();
    if (!trimmed) return;
    if (trimmed === project.name) {
      setShowRenameModal(false);
      return;
    }
    setRenaming(true);
    try {
      const updated = await api.renameProject(project.id, trimmed);
      updateProjectCache(updated);
      setShowRenameModal(false);
      await onRefreshProject();
    } catch (error) {
      setErrorModal({
        title: t('common.error'),
        message: error instanceof Error ? error.message : t('projectInfo.errorRenameProject'),
      });
    } finally {
      setRenaming(false);
    }
  };

  const handleClone = async () => {
    if (!cloneName.trim()) return;
    setCloning(true);
    try {
      const cloned = await api.cloneProject(project.id, { name: cloneName.trim() });
      setShowCloneModal(false);
      await loadProjects();
      route(`/projects/${cloned.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PROJECT_LIMIT') {
        const data = error.data as { limit?: number; current?: number } | undefined;
        setErrorModal({
          title: t('projectLimit.title'),
          message: t('projectLimit.message', {
            limit: data?.limit ?? projectLimit,
            current: data?.current ?? projectCount,
          }),
        });
      } else {
        setErrorModal({
          title: t('common.error'),
          message: error instanceof Error ? error.message : t('projectInfo.errorCloneProject'),
        });
      }
    } finally {
      setCloning(false);
    }
  };

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
              {isOriginalReadingMode
                ? t('projectInfo.originalReading')
                : formatLanguagePairLabel(
                    t,
                    project.sourceLanguage || 'en',
                    project.targetLanguage || 'ru'
                  )}
            </span>
          </div>
          <ProjectActionsMenu
            atProjectLimit={atProjectLimit}
            projectLimit={projectLimit}
            projectCount={projectCount}
            hasChapters={project.chapters.length > 0}
            onRename={openRenameModal}
            onClone={openCloneModal}
            onCopyChapters={() => setShowCopyChaptersModal(true)}
            onBulkDeleteChapters={() => setShowBulkDeleteChaptersModal(true)}
            onDelete={() => setShowDeleteModal(true)}
          />
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
                <ProjectCoverEditor
                  projectId={project.id}
                  coverImageUrl={project.metadata?.coverImageUrl}
                  variant="book"
                  deletingCover={deletingCover}
                  onDeleteRequest={() => setShowDeleteCoverConfirm(true)}
                  onRefreshProject={onRefreshProject}
                  onError={(title, message) => setErrorModal({ title, message })}
                />

                <div class="metadata-details">
                  {/* Translation language pair (project settings) */}
                  <div class="metadata-item metadata-item--language-pair">
                    <span class="metadata-label">{t('project.languagePair')}</span>
                    <div class="metadata-value">
                      <span class="project-language-pair-badge">
                        {formatLanguagePairLabel(
                          t,
                          project.sourceLanguage || 'en',
                          project.targetLanguage || 'ru'
                        )}
                      </span>
                      {onOpenSettings && !languagePairLocked && (
                        <button
                          type="button"
                          class="project-language-pair-edit-link"
                          onClick={onOpenSettings}
                        >
                          {t('project.languagePairEditInSettings')}
                        </button>
                      )}
                      {languagePairLocked && (
                        <p class="project-language-pair-hint">{t('project.languagePairLocked')}</p>
                      )}
                    </div>
                  </div>

                  {/* Original title (from source file) */}
                  <div class="metadata-item metadata-original-title">
                    <span class="metadata-label">{t('projectInfo.originalTitleLabel')}</span>
                    {editingOriginalTitle ? (
                      <div class="project-description-editor">
                        <input
                          ref={originalTitleInputRef}
                          type="text"
                          class="form-input"
                          value={originalTitleDraft}
                          onInput={(e) =>
                            setOriginalTitleDraft((e.target as HTMLInputElement).value)
                          }
                          onKeyDown={handleOriginalTitleKeyDown}
                          placeholder={t('projectInfo.originalTitlePlaceholder')}
                        />
                        <div class="project-description-actions">
                          <button
                            type="button"
                            class="btn btn-secondary btn-sm"
                            onClick={cancelEditingOriginalTitle}
                            disabled={savingOriginalTitle}
                          >
                            {t('common.cancel')}
                          </button>
                          <button
                            type="button"
                            class="btn btn-primary btn-sm"
                            onClick={saveOriginalTitle}
                            disabled={savingOriginalTitle}
                          >
                            {savingOriginalTitle ? '...' : t('common.save')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        class={`metadata-value description-text editable ${!project.metadata?.title ? 'empty' : ''}`}
                        onClick={startEditingOriginalTitle}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && startEditingOriginalTitle()}
                      >
                        {project.metadata?.title
                          ? project.metadata.title
                          : t('projectInfo.originalTitlePlaceholder')}
                      </div>
                    )}
                  </div>

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
                      <span class="metadata-label">{t('project.metadataFileLanguage')}</span>
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
              <ProjectCoverEditor
                projectId={project.id}
                coverImageUrl={project.metadata?.coverImageUrl}
                variant="compact"
                deletingCover={deletingCover}
                onDeleteRequest={() => setShowDeleteCoverConfirm(true)}
                onRefreshProject={onRefreshProject}
                onError={(title, message) => setErrorModal({ title, message })}
              />
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

        <ProjectEntitySection
          project={project}
          authorEntity={authorEntity}
          translatorEntity={translatorEntity}
          tagEntities={tagEntities}
          savingEntities={savingEntities}
          isOwnedTranslatorEntity={isOwnedTranslatorEntity}
          showAuthorPicker={showAuthorPicker}
          onShowAuthorPickerChange={setShowAuthorPicker}
          showTranslatorPicker={showTranslatorPicker}
          onShowTranslatorPickerChange={setShowTranslatorPicker}
          showTagPicker={showTagPicker}
          onShowTagPickerChange={setShowTagPicker}
          onAuthorSelect={handleAuthorSelect}
          onTranslatorSelect={handleTranslatorSelect}
          onTagSelect={handleTagSelect}
          onRemoveAuthor={handleRemoveAuthor}
          onRemoveTranslator={handleRemoveTranslator}
          onRemoveTag={handleRemoveTag}
          onTranslationStatusChange={(status) => saveEntityMetadata({ translationStatus: status })}
        />

        <ProjectPublicationSection
          project={project}
          publication={publication}
          publicationLoading={publicationLoading}
          setPublication={setPublication}
          stats={stats}
          hasPublishableTranslator={hasPublishableTranslator}
          buildingExports={buildingExports}
          updatingPublication={updatingPublication}
          unpublishing={unpublishing}
          onRefreshProject={onRefreshProject}
          onOpenPublishModal={openPublishModal}
          onUnpublishRequest={() => setShowUnpublishConfirm(true)}
          onUpdatePublication={handleUpdatePublication}
          onBuildExports={handleBuildExports}
          onError={(title, message) => setErrorModal({ title, message })}
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

      {/* Rename Modal */}
      <Modal
        isOpen={showRenameModal}
        onClose={() => setShowRenameModal(false)}
        title={t('projectInfo.renameProjectModalTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowRenameModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleRename} loading={renaming} disabled={!renameName.trim()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <Input
          label={t('projectInfo.renameProjectNameLabel')}
          value={renameName}
          onInput={(e) => setRenameName((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleRename();
            }
          }}
        />
      </Modal>

      {/* Clone Modal */}
      <Modal
        isOpen={showCloneModal}
        onClose={() => setShowCloneModal(false)}
        title={t('projectInfo.cloneProjectModalTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCloneModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleClone} loading={cloning} disabled={!cloneName.trim()}>
              {t('projectInfo.cloneProjectConfirm')}
            </Button>
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          {t('projectInfo.cloneProjectHint')}
        </p>
        <Input
          label={t('projectInfo.cloneProjectNameLabel')}
          value={cloneName}
          onInput={(e) => setCloneName((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleClone();
            }
          }}
        />
      </Modal>

      <CopyChaptersModal
        isOpen={showCopyChaptersModal}
        onClose={() => setShowCopyChaptersModal(false)}
        project={project}
        onSuccess={onRefreshProject}
      />

      <BulkDeleteChaptersModal
        isOpen={showBulkDeleteChaptersModal}
        onClose={() => setShowBulkDeleteChaptersModal(false)}
        project={project}
        onSuccess={onRefreshProject}
      />

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
            <Button
              onClick={handlePublish}
              loading={publishing}
              disabled={!hasPublishableTranslator}
            >
              {t('projectInfo.publish')}
            </Button>
          </>
        }
      >
        <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          {t('projectInfo.publishModalHint')}
        </p>
        {!hasPublishableTranslator && (
          <p
            style={{
              marginBottom: '1rem',
              color: 'var(--warning)',
              fontSize: '0.9rem',
            }}
            role="status"
          >
            {t('translatorPseudonym.publishRequired')}
          </p>
        )}
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
