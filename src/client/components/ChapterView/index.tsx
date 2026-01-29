import { useState, useEffect, useCallback, useMemo } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { Chapter, Project, ReaderSettings, TokenUsage } from '../../types';
import { api } from '../../api/client';
import { authService } from '../../services/authService';
import { Card } from '../ui';
import { ChapterHeader } from './ChapterHeader';
import { ReaderSettingsPanel } from './ReaderSettings';
import { ParagraphList } from './ParagraphList';
import { TokenLimitWarning } from '../TokenUsage';

interface ChapterViewProps {
  project: Project;
  chapter: Chapter;
  chapterIndex: number;
  totalChapters: number;
  onPrev: () => void;
  onNext: () => void;
  onChapterUpdate: (chapter: Chapter) => void;
  onEnterReadingMode?: () => void;
  estimatedTokens?: number; // Pass estimated tokens to ChapterHeader
}

const defaultReaderSettings: ReaderSettings = {
  fontSize: 18,
  lineHeight: 1.7,
  fontFamily: 'literary',
  colorScheme: 'dark',
};

export function ChapterView({
  project,
  chapter,
  chapterIndex,
  totalChapters,
  onPrev,
  onNext,
  onChapterUpdate,
  onEnterReadingMode,
}: ChapterViewProps) {
  const { t } = useTranslation();
  const [showSettings, setShowSettings] = useState(false);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(
    project.settings.reader || defaultReaderSettings
  );
  const [translating, setTranslating] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<number | null>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [showTokenWarning, setShowTokenWarning] = useState(false);
  const [estimatedTokens, setEstimatedTokens] = useState(0);
  const [pendingTranslationType, setPendingTranslationType] = useState<'full' | 'empty'>('full');
  const [pendingParagraphIds, setPendingParagraphIds] = useState<string[] | null>(null);
  const [selectedParagraphIds, setSelectedParagraphIds] = useState<string[]>([]);

  const isOriginalReadingMode = project.settings.originalReadingMode ?? false;

  // Empty paragraphs (no valid translation) - for "translate empty" / "translate selected"
  const emptyParagraphIds = useMemo(() => {
    const list = chapter.paragraphs?.filter((p) => {
      const hasText = p.translatedText && p.translatedText.trim().length > 0;
      const isError =
        p.translatedText?.trim().startsWith('❌') ||
        p.translatedText?.trim().startsWith('[ERROR');
      return !hasText || isError;
    }) || [];
    return list.map((p) => p.id);
  }, [chapter.paragraphs]);

  // When chapter or empty list changes, pre-select all empty paragraphs for translation
  useEffect(() => {
    setSelectedParagraphIds(emptyParagraphIds.length > 0 ? [...emptyParagraphIds] : []);
  }, [chapter.id, emptyParagraphIds.join(',')]);

  // Estimate tokens for translation - MUST be defined before estimatedTokensSelected
  const estimateTokens = useCallback((textLength: number): number => {
    const enableAnalysis = project.settings?.enableAnalysis ?? true;
    const enableEditing = project.settings?.enableEditing ?? true;
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

  // Estimated tokens for selected paragraphs only
  const estimatedTokensSelected = useMemo(() => {
    if (!chapter.paragraphs?.length || selectedParagraphIds.length === 0) return 0;
    const idSet = new Set(selectedParagraphIds);
    const totalLength = chapter.paragraphs
      .filter((p) => idSet.has(p.id))
      .reduce((sum, p) => sum + p.originalText.length, 0);
    return estimateTokens(totalLength);
  }, [chapter.paragraphs, selectedParagraphIds, estimateTokens]);

  // Recalculate estimated tokens when project settings or chapter text changes
  useEffect(() => {
    if (chapter.originalText && chapter.status !== 'translating') {
      const estimated = estimateTokens(chapter.originalText.length);
      setEstimatedTokens(estimated);
    }
  }, [estimateTokens, chapter.originalText, chapter.status]);

  // Apply reader settings as CSS variables
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--reader-font-size', `${readerSettings.fontSize}px`);
    root.style.setProperty('--reader-line-height', `${readerSettings.lineHeight}`);
    root.setAttribute('data-reader-font', readerSettings.fontFamily);
    root.setAttribute('data-reader-theme', readerSettings.colorScheme);
  }, [readerSettings]);

  // Poll for chapter updates during translation
  useEffect(() => {
    console.log('🔄 Polling effect triggered, chapter status:', chapter.status, 'has interval:', !!pollingInterval);
    
    if (chapter.status === 'translating') {
      // Clear any existing interval first
      if (pollingInterval) {
        console.log('🧹 Clearing existing polling interval');
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
      
      console.log('▶️ Starting polling for chapter:', chapter.id);
      const interval = window.setInterval(async () => {
        try {
          console.log('📡 Polling chapter status...');
          const updated = await api.getChapter(project.id, chapter.id);
          console.log('📥 Chapter status update:', updated.status);
          onChapterUpdate(updated);
          
          // Stop polling if translation is complete or failed
          if (updated.status !== 'translating') {
            console.log('🛑 Translation finished, stopping polling. Final status:', updated.status);
            clearInterval(interval);
            setPollingInterval(null);
            setTranslating(false);
            
            if (updated.status === 'completed') {
              console.log('✅ Translation completed successfully');
            } else if (updated.status === 'error') {
              console.error('❌ Translation failed with error status');
            }
          }
        } catch (error) {
          console.error('⚠️ Polling error:', error);
          // Continue polling on error (network issues might be temporary)
        }
      }, 2000);
      
      setPollingInterval(interval);
      
      return () => {
        console.log('🧹 Cleanup: clearing polling interval');
        if (interval) {
          clearInterval(interval);
        }
      };
    } else {
      // Clear interval if not translating
      if (pollingInterval) {
        console.log('🛑 Not translating, clearing polling interval');
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
      if (translating && chapter.status !== 'translating') {
        setTranslating(false);
      }
    }
  }, [chapter.status, chapter.id, project.id, translating]);

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
  }, [chapter.id]); // Reload when chapter changes (user navigates to different chapter)

  const handleTranslate = async () => {
    // Prevent double-translation
    if (chapter.status === 'translating' || translating) {
      console.warn('⚠️ Translation already in progress, status:', chapter.status);
      return;
    }

    // Check token limit before starting translation (only if authenticated)
    if (tokenUsage && authService.isAuthenticated()) {
      // Recalculate to ensure we use latest settings
      const estimated = estimateTokens(chapter.originalText.length);
      setEstimatedTokens(estimated);
      
      const tokensAfterTranslation = tokenUsage.tokensUsed + estimated;
      const willExceed = tokensAfterTranslation > tokenUsage.tokensLimit;
      const percentageAfter = (tokensAfterTranslation / tokenUsage.tokensLimit) * 100;
      const shouldWarn = percentageAfter >= 80;

      if (willExceed) {
        // Show warning modal - translation will be blocked
        setPendingTranslationType('full');
        setShowTokenWarning(true);
        return;
      } else if (shouldWarn) {
        // Show warning but allow continuation
        setPendingTranslationType('full');
        setShowTokenWarning(true);
        return;
      }
    }

    // Proceed with translation
    await performTranslation(false);
  };

  const performTranslation = async (
    translateOnlyEmpty: boolean = false,
    paragraphIdsToTranslate?: string[]
  ) => {
    const action = paragraphIdsToTranslate?.length
      ? `${paragraphIdsToTranslate.length} selected paragraphs`
      : translateOnlyEmpty
        ? 'empty paragraphs'
        : 'chapter';
    console.log(`🔮 Starting translation for ${action}:`, chapter.id, chapter.title);
    setTranslating(true);

    const options: { translateOnlyEmpty?: boolean; paragraphIds?: string[] } = {};
    if (paragraphIdsToTranslate?.length) {
      options.paragraphIds = paragraphIdsToTranslate;
    } else if (translateOnlyEmpty) {
      options.translateOnlyEmpty = true;
    }

    try {
      const response = await api.translateChapter(project.id, chapter.id, options);
      console.log('✅ Translation request sent, response:', response);
      
      // Immediately update chapter status to translating to trigger polling
      const updatedChapter = { ...chapter, status: 'translating' as const };
      onChapterUpdate(updatedChapter);
      
      console.log('📊 Chapter status updated to "translating", polling should start');
      
      // Refresh token usage after starting translation (only if authenticated)
      if (tokenUsage && authService.isAuthenticated()) {
        try {
          const updatedUsage = await api.getTokenUsage();
          setTokenUsage(updatedUsage);
        } catch (error: any) {
          // Don't show error for 401 (unauthorized)
          if (error?.status !== 401) {
            console.error('Failed to refresh token usage:', error);
          }
        }
      }
      
      // Polling will handle the rest via useEffect
    } catch (error: any) {
      console.error('❌ Translation error:', error);
      setTranslating(false);
      
      // Check if it's a token limit error (429)
      if (error?.status === 429) {
        const errorData = error.data || {};
        alert(t('tokenLimit.exceededMessage', { message: errorData.message || t('tokenLimit.dailyExhaustedShort') }));
        
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
        
        return;
      }
      
      // Update chapter status to error if translation failed
      const errorChapter = { ...chapter, status: 'error' as const };
      onChapterUpdate(errorChapter);
      
      // Show user-friendly error message
      const errorMessage = error instanceof Error ? error.message : t('errors.unknown');
      alert(`${t('errors.startTranslation')}: ${errorMessage}`);
      console.error('Full error details:', error);
    }
  };

  const handleTranslateEmptyParagraphs = async () => {
    // Prevent double-translation
    if (chapter.status === 'translating' || translating) {
      console.warn('⚠️ Translation already in progress, status:', chapter.status);
      return;
    }

    const emptyParagraphs = chapter.paragraphs?.filter((p) => {
      const hasText = p.translatedText && p.translatedText.trim().length > 0;
      const isError = p.translatedText?.trim().startsWith('❌') || 
                      p.translatedText?.trim().startsWith('[ERROR');
      return !hasText || isError;
    }) || [];

    // Calculate text length for empty paragraphs only
    const emptyTextLength = emptyParagraphs.reduce((sum, p) => sum + p.originalText.length, 0);
    
    // Check token limit before starting translation (only if authenticated)
    if (tokenUsage && emptyTextLength > 0 && authService.isAuthenticated()) {
      const estimated = estimateTokens(emptyTextLength);
      setEstimatedTokens(estimated);
      
      const tokensAfterTranslation = tokenUsage.tokensUsed + estimated;
      const willExceed = tokensAfterTranslation > tokenUsage.tokensLimit;
      const percentageAfter = (tokensAfterTranslation / tokenUsage.tokensLimit) * 100;
      const shouldWarn = percentageAfter >= 80;

      if (willExceed) {
        // Show warning modal - translation will be blocked
        setPendingTranslationType('empty');
        setShowTokenWarning(true);
        return;
      } else if (shouldWarn) {
        // Show warning but allow continuation
        setPendingTranslationType('empty');
        setShowTokenWarning(true);
        return;
      }
    }

    if (emptyParagraphs.length === 0) {
      alert(t('chapterView.noEmptyParagraphs'));
      return;
    }

    // Proceed with translation of empty paragraphs
    await performTranslation(true);
  };

  const handleTranslateSelectedParagraphs = async () => {
    if (chapter.status === 'translating' || translating) return;
    if (selectedParagraphIds.length === 0) {
      alert(t('chapterView.selectOneParagraph'));
      return;
    }

    if (tokenUsage && authService.isAuthenticated()) {
      const tokensAfter = tokenUsage.tokensUsed + estimatedTokensSelected;
      const willExceed = tokensAfter > tokenUsage.tokensLimit;
      const shouldWarn = (tokensAfter / tokenUsage.tokensLimit) * 100 >= 80;
      if (willExceed || shouldWarn) {
        setPendingTranslationType('empty');
        setPendingParagraphIds(selectedParagraphIds);
        setEstimatedTokens(estimatedTokensSelected);
        setShowTokenWarning(true);
        return;
      }
    }

    await performTranslation(true, selectedParagraphIds);
  };

  const handleSelectAllEmpty = () => setSelectedParagraphIds([...emptyParagraphIds]);
  const handleDeselectAll = () => setSelectedParagraphIds([]);

  const handleToggleParagraphSelection = (id: string) => {
    setSelectedParagraphIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleApproveAll = async () => {
    const paragraphIds = chapter.paragraphs
      ?.filter((p) => p.translatedText && p.status !== 'approved')
      .map((p) => p.id);

    if (!paragraphIds?.length) return;

    await api.bulkUpdateParagraphs(project.id, chapter.id, paragraphIds, 'approved');
    const updated = await api.getChapter(project.id, chapter.id);
    onChapterUpdate(updated);
  };

  const handleSaveParagraph = async (paragraphId: string, text: string) => {
    await api.updateParagraph(project.id, chapter.id, paragraphId, {
      translatedText: text,
      status: 'edited',
    });
    const updated = await api.getChapter(project.id, chapter.id);
    onChapterUpdate(updated);
  };

  const handleReaderSettingsChange = async (updates: Partial<ReaderSettings>) => {
    const newSettings = { ...readerSettings, ...updates };
    setReaderSettings(newSettings);
    // Save to server
    await api.updateReaderSettings(project.id, newSettings);
  };

  const paragraphs = chapter.paragraphs || [];

  return (
    <div id="chapterView">
      <Card>
        <ChapterHeader
          chapter={chapter}
          projectId={project.id}
          canPrev={chapterIndex > 0}
          canNext={chapterIndex < totalChapters - 1}
          onPrev={onPrev}
          onNext={onNext}
          onTranslate={handleTranslate}
          onTranslateEmpty={handleTranslateEmptyParagraphs}
          onTranslateSelected={handleTranslateSelectedParagraphs}
          onSelectAllEmpty={handleSelectAllEmpty}
          onDeselectAll={handleDeselectAll}
          selectedParagraphIds={selectedParagraphIds}
          emptyParagraphIds={emptyParagraphIds}
          estimatedTokensSelected={estimatedTokensSelected}
          onApproveAll={handleApproveAll}
          onToggleSettings={() => setShowSettings(!showSettings)}
          onEnterReadingMode={onEnterReadingMode}
          onChapterUpdate={onChapterUpdate}
          translating={translating || chapter.status === 'translating'}
          isOriginalReadingMode={isOriginalReadingMode}
          estimatedTokens={estimatedTokens}
        />

        {showSettings && (
          <ReaderSettingsPanel
            settings={readerSettings}
            onChange={handleReaderSettingsChange}
          />
        )}
        
        {tokenUsage && (
          <TokenLimitWarning
            isOpen={showTokenWarning}
            onClose={() => {
              setShowTokenWarning(false);
              setPendingParagraphIds(null);
            }}
            onConfirm={() => {
              if (pendingParagraphIds?.length) {
                performTranslation(true, pendingParagraphIds);
                setPendingParagraphIds(null);
              } else {
                performTranslation(pendingTranslationType === 'empty');
              }
            }}
            usage={tokenUsage}
            estimatedTokens={estimatedTokens}
          />
        )}

        {/* Progress bar - hidden in original reading mode */}
        {!isOriginalReadingMode && paragraphs.length > 0 && (
          <div class="chapter-progress">
            <div class="progress-bar">
              <div
                class="progress-fill"
                style={{
                  width: `${
                    (paragraphs.filter((p) => p.translatedText).length /
                      paragraphs.length) *
                    100
                  }%`,
                }}
              />
            </div>
            <span class="progress-text">
              {paragraphs.filter((p) => p.translatedText).length}/{paragraphs.length}
            </span>
          </div>
        )}
      </Card>

      {paragraphs.length > 0 ? (
        <ParagraphList
          paragraphs={paragraphs}
          onSave={handleSaveParagraph}
          isOriginalReadingMode={isOriginalReadingMode}
          emptyParagraphIds={emptyParagraphIds}
          selectedParagraphIds={selectedParagraphIds}
          onToggleParagraphSelection={handleToggleParagraphSelection}
        />
      ) : (
        <Card>
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
            <p>{t('chapter.noParagraphs')}</p>
            <p style={{ marginTop: '0.5rem' }}>
              {t('chapter.clickTranslateToStart')}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

// ChapterView is exported as named export above (export function ChapterView)
export { ChapterHeader } from './ChapterHeader';
export { ReaderSettingsPanel } from './ReaderSettings';
export { ParagraphList } from './ParagraphList';

