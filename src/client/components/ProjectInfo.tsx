import { useState, useRef, useCallback, useEffect } from 'preact/hooks';
import { useTranslation, Trans } from 'react-i18next';
import type {
  Project,
  ProjectWithChapterList,
  ProjectSettings,
  Chapter,
  Publication,
} from '../types';
import { Card, Button, Modal, Input, LoadingSpinner, Icon } from './ui';
import { api, ApiError } from '../api/client';
import { authService } from '../services/authService';
import { invalidateProject } from '../store/projects';
import '../components/ChapterView/ReaderSettings.css';

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
  const [exporting, setExporting] = useState<'epub' | 'fb2' | null>(null);
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
  const [publishTitle, setPublishTitle] = useState('');
  const [publishDescription, setPublishDescription] = useState('');
  const [publishAuthorDisplay, setPublishAuthorDisplay] = useState('');
  const [publishTranslatorDisplay, setPublishTranslatorDisplay] = useState('');

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

  const openPublishModal = useCallback(() => {
    setPublishTitle(project.metadata?.title ?? project.name);
    setPublishDescription(project.metadata?.description ?? '');
    const user = authService.getCachedUser();
    setPublishAuthorDisplay(publication?.authorDisplay ?? project.metadata?.authors?.[0] ?? '');
    setPublishTranslatorDisplay(publication?.translatorDisplay ?? user?.email ?? '');
    setShowPublishModal(true);
  }, [
    project.metadata?.title,
    project.metadata?.description,
    project.metadata?.authors,
    project.name,
    publication?.authorDisplay,
    publication?.translatorDisplay,
  ]);

  const handlePublish = useCallback(async () => {
    setPublishing(true);
    try {
      const pub = await api.publishProject(project.id, {
        status: 'published',
        title: publishTitle.trim() || undefined,
        description: publishDescription.trim() || undefined,
        authorDisplay: publishAuthorDisplay.trim() || undefined,
        translatorDisplay: publishTranslatorDisplay.trim() || undefined,
      });
      setPublication(pub);
      setShowPublishModal(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : t('projectInfo.publishError'));
    } finally {
      setPublishing(false);
    }
  }, [
    project.id,
    publishTitle,
    publishDescription,
    publishAuthorDisplay,
    publishTranslatorDisplay,
    t,
  ]);

  const handleUnpublish = useCallback(async () => {
    if (!confirm(t('projectInfo.unpublishConfirm'))) return;
    setUnpublishing(true);
    try {
      await api.unpublishProject(project.id);
      setPublication(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : t('projectInfo.unpublishError'));
    } finally {
      setUnpublishing(false);
    }
  }, [project.id, t]);

  const handleUpdatePublication = useCallback(async () => {
    setUpdatingPublication(true);
    try {
      const user = authService.getCachedUser();
      const pub = await api.publishProject(project.id, {
        status: 'published',
        title: project.metadata?.title ?? project.name,
        description: project.metadata?.description ?? undefined,
        authorDisplay: publication?.authorDisplay ?? project.metadata?.authors?.[0] ?? undefined,
        translatorDisplay: publication?.translatorDisplay ?? user?.email ?? undefined,
        coverImageUrl: project.metadata?.coverImageUrl ?? undefined,
      });
      setPublication(pub);
    } catch (error) {
      alert(error instanceof Error ? error.message : t('projectInfo.publishError'));
    } finally {
      setUpdatingPublication(false);
    }
  }, [
    project.id,
    project.metadata?.title,
    project.metadata?.description,
    project.metadata?.authors,
    project.metadata?.coverImageUrl,
    project.name,
    publication?.authorDisplay,
    publication?.translatorDisplay,
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
      alert(error instanceof Error ? error.message : t('projectInfo.errorSaveDescription'));
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
    if (translatedText.startsWith('❌') || translatedText.startsWith('[ERROR')) return false;
    const hasValidParagraphs = ch.paragraphs?.some((p) => {
      const pText = p.translatedText?.trim() || '';
      return pText.length > 0 && !pText.startsWith('❌') && !pText.startsWith('[ERROR');
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

  const handleExport = async (format: 'epub' | 'fb2') => {
    if (stats.translated === 0) {
      alert(t('projectInfo.noChaptersForExport'));
      return;
    }

    setExporting(format);
    try {
      const result = await api.exportProject(project.id, format);

      // Prefer downloadUrl (proxy): same-origin + Content-Disposition: attachment → browser downloads instead of opening
      if (result.downloadUrl) {
        const token = authService.getToken();
        const res = await fetch(result.downloadUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(res.statusText || 'Download failed');
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = result.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
      } else {
        const link = document.createElement('a');
        link.href = result.url;
        link.download = result.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      console.log(`✅ Экспорт ${format.toUpperCase()} завершен: ${result.filename}`);
    } catch (error: unknown) {
      // Ignore 401 errors - they are handled globally and will show login page
      if (error instanceof ApiError && error.status === 401) {
        // Auth error - handled globally
        return;
      }
      console.error(`Failed to export ${format}:`, error);
      alert(
        error instanceof Error
          ? error.message
          : t('projectInfo.exportError', { format: format.toUpperCase() })
      );
    } finally {
      setExporting(null);
    }
  };

  return (
    <>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{project.name}</h2>
            <span style={{ color: 'var(--text-dim)' }}>
              {isOriginalReadingMode
                ? t('projectInfo.originalReading')
                : t('projectInfo.enToRu')}
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
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm(t('projectInfo.deleteCoverConfirm'))) return;
                              setDeletingCover(true);
                              try {
                                await api.deleteProjectCover(project.id);
                                await onRefreshProject();
                              } catch (error) {
                                console.error('Failed to delete cover:', error);
                                alert(
                                  error instanceof Error
                                    ? error.message
                                    : t('projectInfo.errorDeleteCover')
                                );
                              } finally {
                                setDeletingCover(false);
                              }
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
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm(t('projectInfo.deleteCoverConfirm'))) return;
                            setDeletingCover(true);
                            try {
                              await api.deleteProjectCover(project.id);
                              invalidateProject(project.id);
                              await onRefreshProject();
                            } catch (error) {
                              console.error('Failed to delete cover:', error);
                              alert(
                                error instanceof Error
                                  ? error.message
                                  : t('projectInfo.errorDeleteCover')
                              );
                            } finally {
                              setDeletingCover(false);
                            }
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
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleUnpublish}
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
              alert(error instanceof Error ? error.message : t('projectInfo.errorUploadCover'));
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

        {/* Export Buttons - hidden in original reading mode */}
        {!isOriginalReadingMode && stats.translated > 0 && (
          <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
              <Button
                variant="secondary"
                size="full"
                onClick={() => handleExport('epub')}
                loading={exporting === 'epub'}
                disabled={exporting !== null}
                title={t('export.epub')}
              >
                {t('export.epub')}
              </Button>
              <Button
                variant="secondary"
                size="full"
                onClick={() => handleExport('fb2')}
                loading={exporting === 'fb2'}
                disabled={exporting !== null}
                title={t('export.fb2')}
              >
                {t('export.fb2')}
              </Button>
            </div>
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
          <Input
            label={t('projectInfo.publishAuthorLabel')}
            value={publishAuthorDisplay}
            onInput={(e) => setPublishAuthorDisplay((e.target as HTMLInputElement).value)}
            placeholder={project.metadata?.authors?.[0] ?? ''}
          />
          <Input
            label={t('projectInfo.publishTranslatorLabel')}
            value={publishTranslatorDisplay}
            onInput={(e) => setPublishTranslatorDisplay((e.target as HTMLInputElement).value)}
            placeholder={authService.getCachedUser()?.email ?? ''}
          />
        </div>
      </Modal>
    </>
  );
}
