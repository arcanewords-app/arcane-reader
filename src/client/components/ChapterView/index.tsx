import { useState, useEffect, useMemo } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type {
  Chapter,
  ChapterListItem,
  Project,
  ProjectWithChapterList,
  ProjectSettings,
  ReaderSettings,
} from '../../types';
import { LEGACY_FONT_MAP } from '../../types';
import { api } from '../../api/client';
import { isChunkError } from '../../../shared/chunkErrors';
import { useChapterTranslation } from '../../hooks/useChapterTranslation';
import { Card, AlertModal } from '../ui';
import { ChapterHeader } from './ChapterHeader';
import { ReaderSettingsPanel } from './ReaderSettings';
import { ParagraphList } from './ParagraphList';
import { ParagraphListSkeleton } from './ParagraphListSkeleton';
import { TranslationPanel } from './TranslationPanel';
import { TokenLimitWarning } from '../TokenUsage';

interface ChapterViewProps {
  project: Project | ProjectWithChapterList;
  chapter: Chapter | null;
  /** Used when chapter is null (loading) for header title and nav */
  chapterListItem?: ChapterListItem;
  chapterIndex: number;
  totalChapters: number;
  onPrev: () => void;
  onNext: () => void;
  onChapterUpdate: (chapter: Chapter) => void;
  onEnterReadingMode?: () => void;
  /** Called when project settings are updated (e.g. from TranslationPanel editing block) */
  onSettingsChange?: (settings: ProjectSettings) => void;
}

const defaultReaderSettings: ReaderSettings = {
  fontSize: 16,
  lineHeight: 1.6,
  fontFamily: 'default',
  colorScheme: 'dark',
  textIndent: false,
  textAlign: 'justify',
  hideChapterHeader: false,
  paragraphSpacing: 0.5,
  containerWidth: 69,
};

export function ChapterView({
  project,
  chapter,
  chapterListItem,
  chapterIndex,
  totalChapters,
  onPrev,
  onNext,
  onChapterUpdate,
  onEnterReadingMode,
  onSettingsChange,
}: ChapterViewProps) {
  const { t } = useTranslation();
  const [showSettings, setShowSettings] = useState(false);
  const [showTranslationPanel, setShowTranslationPanel] = useState(false);
  const [markingAsTranslated, setMarkingAsTranslated] = useState(false);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() => {
    const raw = project.settings.reader;
    if (!raw) return { ...defaultReaderSettings };
    let fontFamily = raw.fontFamily ?? defaultReaderSettings.fontFamily;
    const legacy = LEGACY_FONT_MAP[fontFamily as keyof typeof LEGACY_FONT_MAP];
    if (legacy) fontFamily = legacy;
    return { ...defaultReaderSettings, ...raw, fontFamily };
  });
  const [pollingInterval, setPollingInterval] = useState<number | null>(null);
  const [chunkProgress, setChunkProgress] = useState<{
    chunksDone: number;
    totalChunks: number;
  } | null>(null);
  const [selectedParagraphIds, setSelectedParagraphIds] = useState<string[]>([]);
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);

  const isLoading = !chapter;
  const effectiveChapter: Chapter = chapter ?? {
    id: chapterListItem?.id ?? '',
    number: chapterListItem?.number ?? 0,
    title: chapterListItem?.title ?? '',
    status: chapterListItem?.status ?? 'pending',
    originalText: '',
    paragraphs: [],
  };

  const {
    startTranslation,
    translating,
    estimate,
    tokenUsage,
    warningState,
    closeWarning,
    confirmAndProceed,
  } = useChapterTranslation(
    project.id,
    effectiveChapter.id,
    effectiveChapter,
    project,
    onChapterUpdate,
    (title, msg) => setErrorModal({ title, message: msg })
  );

  const isOriginalReadingMode = project.settings.originalReadingMode ?? false;

  // Show only translation column when source=uploaded AND no meaningful original (e.g. mark-as-translated where original=translation).
  // When we have original that differs from translation, show both columns (left: original, right: translation).
  const isTranslationOnlyDisplay = useMemo(() => {
    if (chapter?.translationMeta?.source !== 'uploaded') return false;
    const hasMeaningfulOriginal = chapter?.paragraphs?.some(
      (p) =>
        p.originalText &&
        p.originalText.trim() !== (p.translatedText || '').trim()
    );
    return !hasMeaningfulOriginal;
  }, [chapter?.translationMeta?.source, chapter?.paragraphs]);

  // Empty paragraphs (no valid translation) - for "translate empty" / "translate selected"
  const emptyParagraphIds = useMemo(() => {
    const list =
      chapter?.paragraphs?.filter((p) => {
        const hasText = p.translatedText && p.translatedText.trim().length > 0;
        const isError =
          p.translatedText?.trim().startsWith('❌') || isChunkError(p.translatedText ?? '');
        return !hasText || isError;
      }) || [];
    return list.map((p) => p.id);
  }, [chapter?.paragraphs]);

  const emptyParagraphIdsKey = useMemo(() => emptyParagraphIds.join(','), [emptyParagraphIds]);

  // When chapter or empty list changes, pre-select all empty paragraphs for translation
  useEffect(() => {
    setSelectedParagraphIds(emptyParagraphIds.length > 0 ? [...emptyParagraphIds] : []);
  }, [effectiveChapter.id, emptyParagraphIdsKey, emptyParagraphIds]);

  // Apply reader settings as CSS variables
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--reader-font-size', `${readerSettings.fontSize}px`);
    root.style.setProperty('--reader-line-height', `${readerSettings.lineHeight}`);
    root.style.setProperty(
      '--reader-paragraph-spacing',
      `${Math.max(0.5, readerSettings.paragraphSpacing ?? 0.5)}em`
    );
    root.style.setProperty('--reader-container-width', `${readerSettings.containerWidth ?? 69}%`);
    root.setAttribute('data-reader-font', readerSettings.fontFamily);
    root.setAttribute('data-reader-theme', readerSettings.colorScheme);
    root.setAttribute(
      'data-reader-indent',
      (readerSettings.textIndent ?? false) ? 'true' : 'false'
    );
    root.setAttribute('data-reader-align', readerSettings.textAlign ?? 'justify');
    if (readerSettings.colorScheme === 'custom') {
      root.style.setProperty('--reader-bg', readerSettings.customBg ?? '#f2f2f3');
      root.style.setProperty('--reader-text', readerSettings.customText ?? '#212529');
    } else {
      root.style.removeProperty('--reader-bg');
      root.style.removeProperty('--reader-text');
    }
  }, [readerSettings]);

  // Poll for chapter updates during translation (lightweight status + exponential backoff, skip when tab hidden)
  const MAX_POLL_ATTEMPTS = 120;
  const MAX_CONSECUTIVE_ERRORS = 5;
  useEffect(() => {
    if (!chapter || chapter.status !== 'translating') {
      setChunkProgress(null);
      if (pollingInterval) {
        clearTimeout(pollingInterval);
        setPollingInterval(null);
      }
      return;
    }
    if (pollingInterval) {
      clearTimeout(pollingInterval);
      setPollingInterval(null);
    }

    let delayMs = 1500;
    const maxDelayMs = 10000;
    let attempt = 0;
    let consecutiveErrors = 0;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (document.hidden) {
        timeoutId = setTimeout(poll, delayMs);
        setPollingInterval(timeoutId);
        return;
      }
      attempt++;
      try {
        const data = await api.getChapterStatus(project.id, chapter.id);
        consecutiveErrors = 0;
        const { status, chunksDone, totalChunks } = data;
        if (chunksDone !== undefined && totalChunks !== undefined) {
          setChunkProgress({ chunksDone, totalChunks });
        }
        if (status !== 'translating') {
          setChunkProgress(null);
          const fullChapter = await api.getChapter(project.id, chapter.id);
          onChapterUpdate(fullChapter);
          setPollingInterval(null);
          return;
        }
      } catch (error) {
        console.error('Polling error:', error);
        consecutiveErrors++;
        if (
          consecutiveErrors >= MAX_CONSECUTIVE_ERRORS ||
          attempt >= MAX_POLL_ATTEMPTS
        ) {
          setChunkProgress(null);
          setPollingInterval(null);
          setErrorModal({
            title: t('chapter.pollingLostTitle'),
            message: t('chapter.pollingLostMessage'),
          });
          onChapterUpdate({ ...chapter, status: 'pending' });
          return;
        }
      }
      delayMs = Math.min(delayMs * 1.4, maxDelayMs);
      timeoutId = setTimeout(poll, delayMs);
      setPollingInterval(timeoutId);
    };

    timeoutId = setTimeout(poll, delayMs);
    setPollingInterval(timeoutId);

    return () => {
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onChapterUpdate from parent; pollingInterval is managed inside
  }, [chapter?.status, chapter?.id, project.id, onChapterUpdate]);

  const handleSelectAllEmpty = () => setSelectedParagraphIds([...emptyParagraphIds]);
  const handleDeselectAll = () => setSelectedParagraphIds([]);

  const handleToggleParagraphSelection = (id: string) => {
    setSelectedParagraphIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleCancelTranslation = async () => {
    if (!chapter) return;
    try {
      await api.cancelTranslation(project.id, chapter.id);
      // Optimistic update so UI stops showing "translating" immediately (avoids cache/304)
      onChapterUpdate({ ...chapter, status: 'pending' });
      const updated = await api.getChapter(project.id, chapter.id);
      onChapterUpdate(updated);
    } catch (error) {
      console.error('Failed to cancel translation:', error);
    }
  };

  const handleApproveAll = async () => {
    if (!chapter) return;
    const paragraphIds = chapter.paragraphs
      ?.filter((p) => p.translatedText && p.status !== 'approved')
      .map((p) => p.id);

    if (!paragraphIds?.length) return;

    await api.bulkUpdateParagraphs(project.id, chapter.id, paragraphIds, 'approved');
    const updated = await api.getChapter(project.id, chapter.id);
    onChapterUpdate(updated);
  };

  const handleMarkAsTranslated = async () => {
    if (!chapter) return;
    setMarkingAsTranslated(true);
    try {
      const updated = await api.markChapterAsTranslated(project.id, chapter.id);
      onChapterUpdate(updated);
    } catch (error) {
      console.error('Failed to mark chapter as translated:', error);
    } finally {
      setMarkingAsTranslated(false);
    }
  };

  const handleSaveParagraph = async (paragraphId: string, text: string) => {
    if (!chapter) return;
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

  const paragraphs = chapter?.paragraphs || [];

  return (
    <div id="chapterView">
      <Card>
        <ChapterHeader
          chapter={chapter}
          chapterListItem={chapterListItem}
          projectId={project.id}
          canPrev={chapterIndex > 0}
          canNext={chapterIndex < totalChapters - 1}
          onPrev={onPrev}
          onNext={onNext}
          onToggleTranslationPanel={() => setShowTranslationPanel((v) => !v)}
          isTranslationPanelOpen={showTranslationPanel}
          onApproveAll={handleApproveAll}
          onToggleSettings={() => setShowSettings(!showSettings)}
          onEnterReadingMode={onEnterReadingMode}
          onChapterUpdate={onChapterUpdate}
          isOriginalReadingMode={isOriginalReadingMode}
          isLoading={isLoading}
        />

        {!isOriginalReadingMode && !isLoading && showTranslationPanel && (
          <TranslationPanel
            chapter={chapter}
            project={project}
            projectId={project.id}
            startTranslation={startTranslation}
            translating={translating}
            chunkProgress={chunkProgress}
            estimate={estimate}
            emptyCount={emptyParagraphIds.length}
            selectedParagraphIds={selectedParagraphIds}
            onSelectAllEmpty={handleSelectAllEmpty}
            onDeselectAll={handleDeselectAll}
            onCancelTranslation={handleCancelTranslation}
            onChapterUpdate={onChapterUpdate}
            onMarkAsTranslated={handleMarkAsTranslated}
            markingAsTranslated={markingAsTranslated}
            onSettingsChange={onSettingsChange}
          />
        )}

        {showSettings && (
          <ReaderSettingsPanel settings={readerSettings} onChange={handleReaderSettingsChange} />
        )}

        {tokenUsage && warningState.isOpen && (
          <TokenLimitWarning
            isOpen={warningState.isOpen}
            onClose={closeWarning}
            onConfirm={confirmAndProceed}
            usage={tokenUsage}
            estimatedTokens={warningState.estimatedTokens}
          />
        )}

        {/* Progress bar - hidden in original reading mode */}
        {!isOriginalReadingMode && !isLoading && paragraphs.length > 0 && (
          <div class="chapter-progress">
            <div class="progress-bar">
              <div
                class="progress-fill"
                style={{
                  width: `${
                    (paragraphs.filter((p) => p.translatedText).length / paragraphs.length) * 100
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

      {isLoading ? (
        <ParagraphListSkeleton />
      ) : paragraphs.length > 0 ? (
        <ParagraphList
          paragraphs={paragraphs}
          onSave={handleSaveParagraph}
          isOriginalReadingMode={isOriginalReadingMode}
          isTranslationOnlyDisplay={isTranslationOnlyDisplay}
          emptyParagraphIds={emptyParagraphIds}
          selectedParagraphIds={selectedParagraphIds}
          onToggleParagraphSelection={handleToggleParagraphSelection}
          textBlockTypes={project.settings?.textBlockTypes ?? []}
        />
      ) : (
        <Card>
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
            <p>{t('chapter.noParagraphs')}</p>
            <p style={{ marginTop: '0.5rem' }}>{t('chapter.clickTranslateToStart')}</p>
          </div>
        </Card>
      )}

      <AlertModal
        isOpen={!!errorModal}
        onClose={() => setErrorModal(null)}
        title={errorModal?.title ?? ''}
        message={errorModal?.message ?? ''}
      />
    </div>
  );
}

export { ChapterHeader } from './ChapterHeader';
export { ReaderSettingsPanel } from './ReaderSettings';
export { ParagraphList } from './ParagraphList';
export { TranslationPanel } from './TranslationPanel';
