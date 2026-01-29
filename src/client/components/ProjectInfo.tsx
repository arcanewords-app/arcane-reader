import { useState, useRef, useCallback, useEffect, useMemo } from 'preact/hooks';
import { useTranslation, Trans } from 'react-i18next';
import type { Project, ProjectSettings, Chapter, TokenUsage } from '../types';
import { Card, Button, Modal } from './ui';
import { api, ApiError } from '../api/client';
import { authService } from '../services/authService';
import { invalidateProject } from '../store/projects';
import { TokenLimitWarning } from './TokenUsage';
import '../components/ChapterView/ReaderSettings.css';

interface ProjectInfoProps {
  project: Project;
  onSettingsChange: (settings: ProjectSettings) => void;
  onDelete: () => void;
  onRefreshProject: () => Promise<void>;
  onEnterReadingMode: () => void;
}

export function ProjectInfo({ project, onSettingsChange, onDelete, onRefreshProject, onEnterReadingMode }: ProjectInfoProps) {
  const { t } = useTranslation();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showTranslateAllModal, setShowTranslateAllModal] = useState(false);
  const [translateErrorsOnly, setTranslateErrorsOnly] = useState(false);
  const [exporting, setExporting] = useState<'epub' | 'fb2' | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [deletingCover, setDeletingCover] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [savingDescription, setSavingDescription] = useState(false);
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [showTokenWarning, setShowTokenWarning] = useState(false);
  const [estimatedTotalTokens, setEstimatedTotalTokens] = useState(0);
  const [pendingChaptersToTranslate, setPendingChaptersToTranslate] = useState<Chapter[]>([]);
  interface ChapterProgress {
    chapterId: string;
    title: string;
    status: 'pending' | 'translating' | 'completed' | 'error';
    tokensUsed?: number;
    tokensByStage?: {
      analysis?: number;
      translation: number;
      editing?: number;
    };
    duration?: number;
    glossaryEntries?: number;
  }

  const [translationProgress, setTranslationProgress] = useState<{
    current: number;
    total: number;
    currentChapter: string | null;
    currentChapterId: string | null;
    chapters: ChapterProgress[];
    totalTokens: number;
    totalDuration: number;
    totalGlossaryEntries: number;
    completed: number;
    errors: number;
  } | null>(null);
  const cancelledRef = useRef(false);
  const initialGlossaryCountRef = useRef<number>(0);
  const translateModalWasOpenRef = useRef(false);

  // Selected chapter IDs for "translate selected" modal (only used when modal is open)
  const [translateSelectionIds, setTranslateSelectionIds] = useState<string[]>([]);

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
      const updated = await api.updateProjectMetadata(project.id, {
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

  // Helper function to check if chapter has valid translation (not error message)
  const hasValidTranslation = (chapter: Chapter): boolean => {
    // Check if translatedText exists and is not an error message
    const translatedText = chapter.translatedText?.trim() || '';
    if (translatedText.length === 0) return false;
    
    // Ignore error messages
    if (translatedText.startsWith('❌ Ошибка перевода:') || 
        translatedText.startsWith('[ERROR') ||
        translatedText.startsWith('❌')) {
      return false;
    }
    
    // Check if paragraphs have valid translations
    const hasValidParagraphs = chapter.paragraphs?.some(p => {
      const pText = p.translatedText?.trim() || '';
      return pText.length > 0 && 
             !pText.startsWith('❌') && 
             !pText.startsWith('[ERROR');
    });
    
    return hasValidParagraphs || translatedText.length > 50; // Valid translation should be substantial
  };

  // Helper function to check if chapter is empty (no valid translation)
  const isChapterEmpty = (chapter: Chapter): boolean => {
    // If chapter has error status, it's considered empty (needs retranslation)
    if (chapter.status === 'error') {
      return !hasValidTranslation(chapter);
    }
    
    // For other statuses, check if there's no valid translation
    return !hasValidTranslation(chapter);
  };

  const stats = {
    chapters: project.chapters.length,
    translated: project.chapters.filter((c) => c.status === 'completed').length,
    pending: project.chapters.filter((c) => c.status === 'pending').length,
    error: project.chapters.filter((c) => c.status === 'error').length,
    empty: project.chapters.filter(isChapterEmpty).length, // Chapters without valid translation
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
    } catch (error: any) {
      // Ignore 401 errors - they are handled globally and will show login page
      if (error instanceof ApiError && error.status === 401) {
        // Auth error - handled globally
        return;
      }
      console.error(`Failed to export ${format}:`, error);
      alert(error.message || t('projectInfo.exportError', { format: format.toUpperCase() }));
    } finally {
      setExporting(null);
    }
  };

  // Estimate tokens for translation
  // Use useCallback to ensure it uses latest project.settings
  const estimateTokens = useCallback((textLength: number): number => {
    const enableAnalysis = project.settings?.enableAnalysis ?? true;
    const enableEditing = project.settings?.enableEditing ?? true;
    
    // Tokens per 10k characters (from config)
    const tokensPer10K = {
      analysis: 2000,
      translation: 10000,
      editing: 13000,
    };
    
    const charsIn10K = textLength / 10000;
    let tokens = 0;
    
    if (enableAnalysis) tokens += tokensPer10K.analysis * charsIn10K;
    tokens += tokensPer10K.translation * charsIn10K;
    if (enableEditing) tokens += tokensPer10K.editing * charsIn10K;
    
    return Math.ceil(tokens);
  }, [project.settings?.enableAnalysis, project.settings?.enableEditing]);

  // Chapters eligible for translation in the modal (empty or errors, sorted by number)
  const eligibleChaptersForTranslate = useMemo(() => {
    const list = translateErrorsOnly
      ? project.chapters.filter((c) => c.status === 'error')
      : project.chapters.filter(isChapterEmpty);
    return [...list].sort((a, b) => a.number - b.number);
  }, [project.chapters, translateErrorsOnly]);

  // Selected chapters in order (subset of eligible, for "translate selected")
  const selectedChaptersForTranslate = useMemo(() => {
    const idSet = new Set(translateSelectionIds);
    return eligibleChaptersForTranslate.filter((c) => idSet.has(c.id));
  }, [eligibleChaptersForTranslate, translateSelectionIds]);

  // Estimated tokens for selected chapters only
  const estimatedTokensSelected = useMemo(() => {
    const totalLength = selectedChaptersForTranslate.reduce(
      (sum, ch) => sum + ch.originalText.length,
      0
    );
    return estimateTokens(totalLength);
  }, [selectedChaptersForTranslate, estimateTokens]);

  // When translate modal opens, pre-select all eligible chapters
  useEffect(() => {
    if (showTranslateAllModal) {
      if (!translateModalWasOpenRef.current) {
        setTranslateSelectionIds(eligibleChaptersForTranslate.map((c) => c.id));
        translateModalWasOpenRef.current = true;
      }
    } else {
      translateModalWasOpenRef.current = false;
    }
  }, [showTranslateAllModal, eligibleChaptersForTranslate]);

  // Load token usage
  useEffect(() => {
    // Only load if authenticated
    if (!authService.isAuthenticated()) {
      return;
    }

    const loadTokenUsage = async () => {
      try {
        const usage = await api.getTokenUsage();
        setTokenUsage(usage);
      } catch (error: any) {
        // Don't show error for 401 (unauthorized) - user just needs to login
        if (error?.status === 401) {
          return;
        }
        console.error('Failed to load token usage:', error);
        // Don't show error, just continue without token checking
      }
    };
    
    loadTokenUsage();
    // Refresh every 30 seconds (only if authenticated)
    const interval = setInterval(() => {
      if (authService.isAuthenticated()) {
        loadTokenUsage();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Poll chapter status until translation completes
  const pollChapterStatus = async (
    chapterId: string,
    maxAttempts: number = 60
  ): Promise<{ success: boolean; chapter?: Chapter; error?: string }> => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (cancelledRef.current) {
        return { success: false, error: t('projectInfo.errorCanceled') };
      }

      try {
        const chapter = await api.getChapter(project.id, chapterId);
        
        if (chapter.status === 'completed') {
          return { success: true, chapter };
        }
        
        if (chapter.status === 'error') {
          return { success: false, error: t('projectInfo.errorTranslation') };
        }

        // Wait 2 seconds before next poll
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error('Polling error:', error);
        return { success: false, error: t('projectInfo.errorStatusCheck') };
      }
    }

    return { success: false, error: t('projectInfo.errorTimeout') };
  };

  // Translate selected chapters (from modal selection)
  const handleTranslateAll = async () => {
    const chaptersToTranslate = selectedChaptersForTranslate;

    if (chaptersToTranslate.length === 0) {
      alert(t('projectInfo.selectOneChapter'));
      return;
    }

    // Check token limit before starting translation (only if authenticated)
    if (tokenUsage && authService.isAuthenticated()) {
      setEstimatedTotalTokens(estimatedTokensSelected);
      setPendingChaptersToTranslate(chaptersToTranslate);

      const tokensAfterTranslation = tokenUsage.tokensUsed + estimatedTokensSelected;
      const willExceed = tokensAfterTranslation > tokenUsage.tokensLimit;
      const percentageAfter = (tokensAfterTranslation / tokenUsage.tokensLimit) * 100;
      const shouldWarn = percentageAfter >= 80;

      if (willExceed) {
        setShowTokenWarning(true);
        return;
      }
      if (shouldWarn) {
        setShowTokenWarning(true);
        return;
      }
    }

    await performTranslateAll(chaptersToTranslate);
  };

  const performTranslateAll = async (chaptersToTranslate: Chapter[]) => {
    setShowTranslateAllModal(false);

    cancelledRef.current = false;
    
    // Refresh token usage before starting
    if (tokenUsage) {
      try {
        const updatedUsage = await api.getTokenUsage();
        setTokenUsage(updatedUsage);
      } catch (error) {
        console.error('Failed to refresh token usage:', error);
      }
    }
    
    // Store initial glossary count
    initialGlossaryCountRef.current = project.glossary.length;
    
    // Initialize chapters progress
    const chaptersProgress: ChapterProgress[] = chaptersToTranslate.map((ch) => ({
      chapterId: ch.id,
      title: ch.title,
      status: ch.status === 'error' ? 'error' : 'pending',
    }));
    
    setTranslationProgress({
      current: 0,
      total: chaptersToTranslate.length,
      currentChapter: null,
      currentChapterId: null,
      chapters: chaptersProgress,
      totalTokens: 0,
      totalDuration: 0,
      totalGlossaryEntries: 0,
      completed: 0,
      errors: 0,
    });

    const startTime = Date.now();

    try {
      for (let i = 0; i < chaptersToTranslate.length; i++) {
        if (cancelledRef.current) {
          break;
        }

        const chapter = chaptersToTranslate[i];
        const chapterStartTime = Date.now();
        
        // Update current chapter
        setTranslationProgress((prev) =>
          prev
            ? {
                ...prev,
                current: i + 1,
                currentChapter: chapter.title,
                currentChapterId: chapter.id,
                chapters: prev.chapters.map((ch) =>
                  ch.chapterId === chapter.id
                    ? { ...ch, status: 'translating' }
                    : ch
                ),
              }
            : null
        );

        try {
          // Start translation
          await api.translateChapter(project.id, chapter.id);
          
          // Poll until complete
          const result = await pollChapterStatus(chapter.id);
          
          // Refresh project to get latest data
          await onRefreshProject();
          const updatedProject = await api.getProject(project.id);
          const updatedChapter = updatedProject.chapters.find((c) => c.id === chapter.id);
          
          if (result.success && updatedChapter) {
            const chapterDuration = updatedChapter.translationMeta?.duration || (Date.now() - chapterStartTime);
            const tokensUsed = updatedChapter.translationMeta?.tokensUsed || 0;
            const tokensByStage = updatedChapter.translationMeta?.tokensByStage;
            
            // Calculate new glossary entries for this chapter
            const previousGlossaryCount = initialGlossaryCountRef.current;
            const currentGlossaryCount = updatedProject.glossary.length;
            const glossaryEntries = Math.max(0, currentGlossaryCount - previousGlossaryCount);
            
            setTranslationProgress((prev) =>
              prev
                ? {
                    ...prev,
                    completed: prev.completed + 1,
                    totalTokens: prev.totalTokens + tokensUsed,
                    totalDuration: prev.totalDuration + chapterDuration,
                    totalGlossaryEntries: updatedProject.glossary.length - initialGlossaryCountRef.current,
                    chapters: prev.chapters.map((ch) =>
                      ch.chapterId === chapter.id
                        ? {
                            ...ch,
                            status: 'completed',
                            tokensUsed,
                            tokensByStage,
                            duration: chapterDuration,
                            glossaryEntries,
                          }
                        : ch
                    ),
                  }
                : null
            );
            
            // Update initial count for next iteration
            initialGlossaryCountRef.current = currentGlossaryCount;
          } else {
            setTranslationProgress((prev) =>
              prev
                ? {
                    ...prev,
                    errors: prev.errors + 1,
                    chapters: prev.chapters.map((ch) =>
                      ch.chapterId === chapter.id
                        ? { ...ch, status: 'error' }
                        : ch
                    ),
                  }
                : null
            );
          }
        } catch (error: any) {
          console.error(`Translation error for chapter ${chapter.id}:`, error);
          
          // Check if it's a token limit error (429)
          if (error?.status === 429) {
            const errorData = error.data || {};
            alert(t('projectInfo.tokenLimitExceededChapter', { title: chapter.title, message: errorData.message || t('tokenLimit.dailyExhaustedShort') }));
            
        // Refresh token usage to show current state (only if authenticated)
        if (authService.isAuthenticated()) {
          try {
            const updatedUsage = await api.getTokenUsage();
            setTokenUsage(updatedUsage);
          } catch (refreshError: any) {
            // Don't show error for 401 (unauthorized)
            if (refreshError?.status !== 401) {
              console.error('Failed to refresh token usage:', refreshError);
            }
          }
        }
            
            // Stop translation process
            break;
          }
          
          setTranslationProgress((prev) =>
            prev
              ? {
                  ...prev,
                  errors: prev.errors + 1,
                  chapters: prev.chapters.map((ch) =>
                    ch.chapterId === chapter.id
                      ? { ...ch, status: 'error' }
                      : ch
                  ),
                }
              : null
          );
        }
      }

      // Final refresh
      await onRefreshProject();
    } finally {
      // Don't auto-close - let user close manually to review the results
      cancelledRef.current = false;
      setTranslateErrorsOnly(false); // Reset flag after translation
    }
  };

  const handleCancelTranslation = useCallback(() => {
    cancelledRef.current = true;
    setTranslationProgress(null);
  }, []);

  const handleCloseTranslation = useCallback(() => {
    setTranslationProgress(null);
    cancelledRef.current = false;
    setTranslateErrorsOnly(false); // Reset flag when closing
  }, []);

  // Check if translation is completed
  const isTranslationComplete = translationProgress !== null && 
    translationProgress.current >= translationProgress.total;

  return (
    <>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{project.name}</h2>
            <span style={{ color: 'var(--text-dim)' }}>
              {isOriginalReadingMode ? `📖 ${t('projectInfo.originalReading')}` : t('projectInfo.enToRu')}
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setShowDeleteModal(true)}>
            🗑️ {t('projectInfo.delete')}
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
        {project.type === 'book' && project.metadata && Object.keys(project.metadata).length > 0 && (
          <div class="book-metadata-section">
            <div class="metadata-header">
              <span class="metadata-icon">📚</span>
              <h3 class="metadata-title">{t('projectInfo.bookInfo')}</h3>
            </div>
            <div class="metadata-content">
              {/* Cover Image */}
              <div 
                class="metadata-cover"
                style={{ 
                  cursor: project.metadata?.coverImageUrl ? 'default' : 'pointer',
                  position: 'relative'
                }}
                onClick={() => {
                  if (!project.metadata?.coverImageUrl && !uploadingCover && !deletingCover) {
                    const input = document.getElementById('cover-upload-input') as HTMLInputElement;
                    input?.click();
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
                      <div style={{ 
                        position: 'absolute', 
                        top: '0.5rem', 
                        right: '0.5rem',
                        background: 'rgba(0, 0, 0, 0.7)',
                        borderRadius: '4px',
                        padding: '0.25rem 0.5rem',
                        color: 'white',
                        fontSize: '0.85rem'
                      }}>
                        ⏳
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm(t('projectInfo.deleteCoverConfirm'))) return;
                            setDeletingCover(true);
                            try {
                              const result = await api.deleteProjectCover(project.id);
                              await onRefreshProject();
                            } catch (error) {
                              console.error('Failed to delete cover:', error);
                              alert(error instanceof Error ? error.message : t('projectInfo.errorDeleteCover'));
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
                            transition: 'all 0.2s'
                          }}
                          title={t('projectInfo.deleteCoverTitle')}
                        >
                          🗑️
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const input = document.getElementById('cover-upload-input') as HTMLInputElement;
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
                            transition: 'all 0.2s'
                          }}
                          title={t('projectInfo.replaceCoverTitle')}
                        >
                          {uploadingCover ? '⏳' : '📤'}
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <div style={{
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
                    cursor: 'pointer'
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
                    <div style={{ fontSize: '3rem', opacity: 0.5 }}>🖼️</div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '0 1rem' }}>
                      {uploadingCover ? `⏳ ${t('projectInfo.uploadCoverLoading')}` : t('projectInfo.uploadCoverClick')}
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
                      {project.metadata.seriesNumber && ` (${t('projectInfo.bookInSeries', { n: project.metadata.seriesNumber })})`}
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
                        day: 'numeric'
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
                        onInput={(e) => setDescriptionDraft((e.target as HTMLTextAreaElement).value)}
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
                          {savingDescription ? '⏳' : `💾 ${t('common.save')}`}
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
        {(!project.type || project.type !== 'book' || !project.metadata || Object.keys(project.metadata).length === 0) && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
              🖼️ {t('projectInfo.coverAndDescription')}
            </h3>
            <div class="metadata-content" style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div 
                class="metadata-cover"
                style={{ 
                  position: 'relative', 
                  flexShrink: 0,
                  cursor: project.metadata?.coverImageUrl ? 'default' : 'pointer'
                }}
                onClick={() => {
                  if (!project.metadata?.coverImageUrl && !uploadingCover && !deletingCover) {
                    const input = document.getElementById('cover-upload-input') as HTMLInputElement;
                    input?.click();
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
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                    }}
                  />
                  {deletingCover ? (
                    <div style={{ 
                      position: 'absolute', 
                      top: '0.5rem', 
                      right: '0.5rem',
                      background: 'rgba(0, 0, 0, 0.7)',
                      borderRadius: '4px',
                      padding: '0.25rem 0.5rem',
                      color: 'white',
                      fontSize: '0.85rem'
                    }}>
                      ⏳
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(t('projectInfo.deleteCoverConfirm'))) return;
                          setDeletingCover(true);
                          try {
                            const result = await api.deleteProjectCover(project.id);
                            // Invalidate project cache
                            invalidateProject(project.id);
                            await onRefreshProject();
                          } catch (error) {
                            console.error('Failed to delete cover:', error);
                            alert(error instanceof Error ? error.message : t('projectInfo.errorDeleteCover'));
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
                          transition: 'all 0.2s'
                        }}
                        title={t('projectInfo.deleteCoverTitle')}
                      >
                        🗑️
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const input = document.getElementById('cover-upload-input') as HTMLInputElement;
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
                          transition: 'all 0.2s'
                        }}
                        title={t('projectInfo.replaceCoverTitle')}
                      >
                        {uploadingCover ? '⏳' : '📤'}
                      </button>
                    </>
                  )}
                </>
              ) : (
                <div style={{
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
                  cursor: 'pointer'
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
                  <div style={{ fontSize: '3rem', opacity: 0.5 }}>🖼️</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '0 1rem' }}>
                    {uploadingCover ? `⏳ ${t('projectInfo.uploadCoverLoading')}` : t('projectInfo.uploadCoverClick')}
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
                        onInput={(e) => setDescriptionDraft((e.target as HTMLTextAreaElement).value)}
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
                          {savingDescription ? '⏳' : `💾 ${t('common.save')}`}
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
              // Invalidate project cache
              invalidateProject(project.id);
              // Update local project state with new metadata
              if (result.project) {
                // Update project state directly with new metadata
                const updatedProject = {
                  ...project,
                  metadata: result.project.metadata,
                };
                // Call onRefreshProject to reload from server
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
        {!isOriginalReadingMode && (() => {
          const completedChapters = project.chapters.filter(c => c.status === 'completed' && c.translationMeta);
          const totalTokens = completedChapters.reduce((sum, c) => sum + (c.translationMeta?.tokensUsed || 0), 0);
          const totalDuration = completedChapters.reduce((sum, c) => sum + (c.translationMeta?.duration || 0), 0);
          const lastTranslated = completedChapters
            .filter(c => c.translationMeta?.translatedAt)
            .sort((a, b) => {
              const aDate = a.translationMeta?.translatedAt || '';
              const bDate = b.translationMeta?.translatedAt || '';
              return bDate.localeCompare(aDate);
            })[0];
          
          if (completedChapters.length > 0) {
            return (
              <div class="translation-stats-section">
                <div class="metadata-header">
                  <span class="metadata-icon">📊</span>
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
                      <span class="translation-stat-label">{t('projectInfo.translationTime')}</span>
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
                      <span class="translation-stat-label">{t('projectInfo.lastTranslation')}</span>
                      <span class="translation-stat-value">
                        {new Date(lastTranslated.translationMeta!.translatedAt).toLocaleDateString('ru-RU', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
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
                        day: 'numeric'
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
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                </div>
              </div>
            );
          }
          return null;
        })()}

        {/* Mass Translation Buttons - only for translating all chapters in project, hidden in original reading mode */}
        {!isOriginalReadingMode && (stats.empty > 0 || stats.error > 0) && (
          <div style={{ marginTop: '1.5rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {stats.error > 0 && (
              <Button
                variant="primary"
                size="full"
                onClick={() => {
                  setTranslateErrorsOnly(true);
                  setShowTranslateAllModal(true);
                }}
                disabled={translationProgress !== null}
                style={{ background: 'var(--error)', borderColor: 'var(--error)' }}
              >
                🔄 {t('projectInfo.translateAllErrors', { count: stats.error })}
              </Button>
            )}
            {stats.empty > 0 && (
              <Button
                variant="primary"
                size="full"
                onClick={() => {
                  setTranslateErrorsOnly(false);
                  setShowTranslateAllModal(true);
                }}
                disabled={translationProgress !== null}
              >
                🔮 {t('projectInfo.translateAllEmpty', { count: stats.empty })}
              </Button>
            )}
          </div>
        )}

        {/* Reading Mode Button */}
        {isOriginalReadingMode ? (
          // In original reading mode: show reading button for all chapters
          stats.chapters > 0 && (
            <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
              <Button
                variant="secondary"
                size="full"
                onClick={onEnterReadingMode}
              >
                📖 {t('projectInfo.readingChapters', { count: stats.chapters })}
              </Button>
            </div>
          )
        ) : (
          // In translation mode: show reading button only for translated chapters
          stats.translated > 0 && (
            <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
              <Button
                variant="secondary"
                size="full"
                onClick={onEnterReadingMode}
              >
                📖 {t('projectInfo.readingModeChapters', { count: stats.translated })}
              </Button>
            </div>
          )
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
                📚 {t('export.epub')}
              </Button>
              <Button
                variant="secondary"
                size="full"
                onClick={() => handleExport('fb2')}
                loading={exporting === 'fb2'}
                disabled={exporting !== null}
                title={t('export.fb2')}
              >
                📖 {t('export.fb2')}
              </Button>
            </div>
          </div>
        )}

      </Card>

      {/* Delete Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title={`🗑️ ${t('projectInfo.deleteProjectConfirm')}`}
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
          <Trans i18nKey="projectInfo.confirmDeleteProject" values={{ name: project.name }} components={{ strong: <strong /> }} />
        </p>
      </Modal>

      {/* Translate chapters modal: select which chapters to translate */}
      <Modal
        isOpen={showTranslateAllModal}
        onClose={() => {
          setTranslateErrorsOnly(false);
          setShowTranslateAllModal(false);
        }}
        title={translateErrorsOnly
          ? `🔄 ${t('projectInfo.translateErrorsModalTitle')}`
          : `🔮 ${t('projectInfo.translateEmptyModalTitle')}`}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setTranslateErrorsOnly(false);
                setShowTranslateAllModal(false);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleTranslateAll}
              disabled={selectedChaptersForTranslate.length === 0}
              title={selectedChaptersForTranslate.length === 0 ? t('projectInfo.selectOneChapter') : undefined}
            >
              {t('projectInfo.translateSelectedCount', { count: selectedChaptersForTranslate.length })}
            </Button>
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          {t('projectInfo.chooseChaptersHint')}
        </p>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
          <button
            type="button"
            onClick={() => setTranslateSelectionIds(eligibleChaptersForTranslate.map((c) => c.id))}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            {t('chapter.selectAll')}
          </button>
          <button
            type="button"
            onClick={() => setTranslateSelectionIds([])}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            {t('chapter.deselectAll')}
          </button>
        </div>
        <div
          style={{
            maxHeight: '240px',
            overflowY: 'auto',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            background: 'var(--bg-secondary)',
            marginBottom: '0.75rem',
          }}
        >
          {eligibleChaptersForTranslate.length === 0 ? (
            <div style={{ padding: '1rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
              {translateErrorsOnly ? t('projectInfo.noErrorChapters') : t('projectInfo.noEmptyChapters')}
            </div>
          ) : (
            eligibleChaptersForTranslate.map((chapter, index) => {
              const checked = translateSelectionIds.includes(chapter.id);
              const isLast = index === eligibleChaptersForTranslate.length - 1;
              return (
                <label
                  key={chapter.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.4rem 0.75rem',
                    cursor: 'pointer',
                    borderBottom: isLast ? 'none' : '1px solid var(--border)',
                    margin: 0,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      e.stopPropagation();
                      setTranslateSelectionIds((prev) =>
                        prev.includes(chapter.id)
                          ? prev.filter((id) => id !== chapter.id)
                          : [...prev, chapter.id]
                      );
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ accentColor: 'var(--accent)', flexShrink: 0 }}
                  />
                  <span style={{ minWidth: '1.5rem', fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                    {chapter.number}
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {chapter.title}
                  </span>
                </label>
              );
            })
          )}
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
          <Trans i18nKey="projectInfo.selectedChapters" values={{ count: selectedChaptersForTranslate.length }} components={{ strong: <strong style={{ color: 'var(--text-secondary)' }} /> }} />
          {tokenUsage && authService.isAuthenticated() && (
            <> · <Trans i18nKey="projectInfo.approxTokens" values={{ tokens: estimatedTokensSelected.toLocaleString() }} components={{ strong: <strong style={{ color: 'var(--text-secondary)' }} /> }} /></>
          )}
        </div>
      </Modal>

      {/* Translation Progress Modal */}
      <Modal
        isOpen={translationProgress !== null}
        onClose={isTranslationComplete ? handleCloseTranslation : handleCancelTranslation}
        title={`🔮 ${t('projectInfo.translationProgressTitle')}`}
        className="translation-progress-modal"
        preventClose={!isTranslationComplete}
      >
        {translationProgress && (
          <div>
            {/* Overall Progress */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {t('projectInfo.progressLabel', { current: translationProgress.current, total: translationProgress.total })}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {Math.round((translationProgress.current / translationProgress.total) * 100)}%
                </span>
              </div>
              <div class="progress-bar" style={{ width: '100%', height: '10px', marginBottom: '1rem' }}>
                <div
                  class="progress-fill"
                  style={{
                    width: `${(translationProgress.current / translationProgress.total) * 100}%`,
                    height: '100%',
                  }}
                />
              </div>
            </div>

            {/* Stages Indicator */}
            <div style={{ marginBottom: '1.5rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>
                {t('projectInfo.translationStagesLabel')}
              </div>
              <div class="stages-grid" style={{ gap: '0.5rem' }}>
                <div class={`stage-toggle ${settings.enableAnalysis !== false ? 'active' : ''}`} style={{ cursor: 'default', opacity: settings.enableAnalysis !== false ? 1 : 0.5 }}>
                  <span class="stage-icon">🔍</span>
                  <span class="stage-name">{t('projectInfo.stageAnalysis')}</span>
                </div>
                <span class="stage-arrow">→</span>
                <div class="stage-toggle active" style={{ cursor: 'default' }}>
                  <span class="stage-icon">🔮</span>
                  <span class="stage-name">{t('projectInfo.stageTranslation')}</span>
                </div>
                <span class="stage-arrow">→</span>
                <div class={`stage-toggle ${settings.enableEditing !== false ? 'active' : ''}`} style={{ cursor: 'default', opacity: settings.enableEditing !== false ? 1 : 0.5 }}>
                  <span class="stage-icon">✨</span>
                  <span class="stage-name">{t('projectInfo.stageEditing')}</span>
                </div>
              </div>
            </div>

            {/* Current Chapter Info */}
            {translationProgress.currentChapter && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-hover)', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>
                  {t('projectInfo.currentChapterLabel')}
                </div>
                <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{translationProgress.currentChapter}</div>
                
                {(() => {
                  const currentChapterProgress = translationProgress.chapters.find(
                    (ch) => ch.chapterId === translationProgress.currentChapterId
                  );
                  
                  if (currentChapterProgress?.tokensUsed || currentChapterProgress?.duration) {
                    const tokensByStage = currentChapterProgress.tokensByStage;
                    const stageTokens: string[] = [];
                    
                    if (tokensByStage) {
                      if (tokensByStage.analysis) {
                        stageTokens.push(`🔍 ${tokensByStage.analysis.toLocaleString()}`);
                      }
                      stageTokens.push(`🔮 ${tokensByStage.translation.toLocaleString()}`);
                      if (tokensByStage.editing) {
                        stageTokens.push(`✨ ${tokensByStage.editing.toLocaleString()}`);
                      }
                    }
                    
                    return (
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.25rem' }}>
                          {currentChapterProgress.duration && (
                            <span>⏱️ {(currentChapterProgress.duration / 1000).toFixed(1)} {t('projectInfo.timeSeconds')}</span>
                          )}
                          {currentChapterProgress.tokensUsed && (
                            <span>📝 {t('projectInfo.totalShort')} {currentChapterProgress.tokensUsed.toLocaleString()}</span>
                          )}
                          {currentChapterProgress.glossaryEntries !== undefined && currentChapterProgress.glossaryEntries > 0 && (
                            <span>📚 +{currentChapterProgress.glossaryEntries} {t('projectInfo.inGlossaryShort')}</span>
                          )}
                        </div>
                        {stageTokens.length > 0 && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
                            {t('projectInfo.tokensByStages')} {stageTokens.join(' | ')}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}

            {/* Overall Statistics */}
            {(translationProgress.totalTokens > 0 || translationProgress.totalDuration > 0 || translationProgress.totalGlossaryEntries > 0) && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', fontSize: '0.9rem' }}>
                <div style={{ color: 'var(--text-dim)', marginBottom: '0.5rem' }}>{t('projectInfo.generalStats')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                  {translationProgress.totalDuration > 0 && (
                    <span>⏱️ {(translationProgress.totalDuration / 1000).toFixed(1)} {t('projectInfo.timeSeconds')}</span>
                  )}
                  {translationProgress.totalTokens > 0 && (
                    <span>📝 {t('projectInfo.totalShort')} {translationProgress.totalTokens.toLocaleString()} {t('projectInfo.tokensCount')}</span>
                  )}
                  {translationProgress.totalGlossaryEntries > 0 && (
                    <span>📚 +{translationProgress.totalGlossaryEntries} {t('projectInfo.glossaryEntriesCount')}</span>
                  )}
                </div>
                {/* Calculate tokens by stage from all completed chapters */}
                {(() => {
                  const completedChapters = translationProgress.chapters.filter(ch => ch.status === 'completed' && ch.tokensByStage);
                  if (completedChapters.length > 0) {
                    const totalByStage = completedChapters.reduce((acc, ch) => {
                      if (ch.tokensByStage) {
                        acc.analysis = (acc.analysis || 0) + (ch.tokensByStage.analysis || 0);
                        acc.translation = (acc.translation || 0) + ch.tokensByStage.translation;
                        acc.editing = (acc.editing || 0) + (ch.tokensByStage.editing || 0);
                      }
                      return acc;
                    }, { analysis: 0, translation: 0, editing: 0 } as { analysis: number; translation: number; editing: number });
                    
                    const stageTokens: string[] = [];
                    if (totalByStage.analysis > 0) {
                      stageTokens.push(`🔍 ${t('projectInfo.stageAnalysis')}: ${totalByStage.analysis.toLocaleString()}`);
                    }
                    stageTokens.push(`🔮 ${t('projectInfo.stageTranslation')}: ${totalByStage.translation.toLocaleString()}`);
                    if (totalByStage.editing > 0) {
                      stageTokens.push(`✨ ${t('projectInfo.stageEditing')}: ${totalByStage.editing.toLocaleString()}`);
                    }
                    
                    return (
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                        {t('projectInfo.tokensByStages')} {stageTokens.join(' | ')}
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}

            {/* Summary */}
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              <div style={{ color: 'var(--success)' }}>
                ✅ {t('projectInfo.completedCount', { count: translationProgress.completed })}
              </div>
              {translationProgress.errors > 0 && (
                <div style={{ color: 'var(--error)' }}>
                  ❌ {t('projectInfo.errorsCount', { count: translationProgress.errors })}
                </div>
              )}
            </div>

            <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
              {isTranslationComplete ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleCloseTranslation}
                  style={{ width: '100%' }}
                >
                  {t('common.close')}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCancelTranslation}
                  style={{ width: '100%' }}
                >
                  {t('chapter.cancelTranslate')}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {tokenUsage && (
        <TokenLimitWarning
          isOpen={showTokenWarning}
          onClose={() => setShowTokenWarning(false)}
          onConfirm={() => performTranslateAll(pendingChaptersToTranslate)}
          usage={tokenUsage}
          estimatedTokens={estimatedTotalTokens}
        />
      )}
    </>
  );
}

