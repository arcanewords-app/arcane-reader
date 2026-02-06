import { useState, useEffect, useMemo } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { Chapter, Project, ReaderSettings } from '../../types';
import { api } from '../../api/client';
import { useChapterTranslation } from '../../hooks/useChapterTranslation';
import { Card } from '../ui';
import { ChapterHeader } from './ChapterHeader';
import { ReaderSettingsPanel } from './ReaderSettings';
import { ParagraphList } from './ParagraphList';
import { TranslationPanel } from './TranslationPanel';
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
  const [showTranslationPanel, setShowTranslationPanel] = useState(false);
  const [markingAsTranslated, setMarkingAsTranslated] = useState(false);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(
    project.settings.reader || defaultReaderSettings
  );
  const [pollingInterval, setPollingInterval] = useState<number | null>(null);
  const [selectedParagraphIds, setSelectedParagraphIds] = useState<string[]>([]);

  const {
    startTranslation,
    translating,
    estimate,
    tokenUsage,
    warningState,
    closeWarning,
    confirmAndProceed,
  } = useChapterTranslation(project.id, chapter.id, chapter, project, onChapterUpdate);

  const isOriginalReadingMode = project.settings.originalReadingMode ?? false;

  // Show only translation column when translation was uploaded (author marked as ready-made)
  const isTranslationOnlyDisplay = chapter.translationMeta?.source === 'uploaded';

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

  // Apply reader settings as CSS variables
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--reader-font-size', `${readerSettings.fontSize}px`);
    root.style.setProperty('--reader-line-height', `${readerSettings.lineHeight}`);
    root.setAttribute('data-reader-font', readerSettings.fontFamily);
    root.setAttribute('data-reader-theme', readerSettings.colorScheme);
  }, [readerSettings]);

  // Poll for chapter updates during translation (lightweight status + exponential backoff, skip when tab hidden)
  useEffect(() => {
    if (chapter.status !== 'translating') {
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
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (document.hidden) {
        timeoutId = setTimeout(poll, delayMs);
        setPollingInterval(timeoutId);
        return;
      }
      try {
        const { status } = await api.getChapterStatus(project.id, chapter.id);
        if (status !== 'translating') {
          const fullChapter = await api.getChapter(project.id, chapter.id);
          onChapterUpdate(fullChapter);
          setPollingInterval(null);
          return;
        }
      } catch (error) {
        console.error('Polling error:', error);
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
  }, [chapter.status, chapter.id, project.id]);

  const handleSelectAllEmpty = () => setSelectedParagraphIds([...emptyParagraphIds]);
  const handleDeselectAll = () => setSelectedParagraphIds([]);

  const handleToggleParagraphSelection = (id: string) => {
    setSelectedParagraphIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleCancelTranslation = async () => {
    try {
      await api.cancelTranslation(project.id, chapter.id);
      const updated = await api.getChapter(project.id, chapter.id);
      onChapterUpdate(updated);
    } catch (error) {
      console.error('Failed to cancel translation:', error);
    }
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

  const handleMarkAsTranslated = async () => {
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
          onToggleTranslationPanel={() => setShowTranslationPanel((v) => !v)}
          isTranslationPanelOpen={showTranslationPanel}
          onApproveAll={handleApproveAll}
          onToggleSettings={() => setShowSettings(!showSettings)}
          onEnterReadingMode={onEnterReadingMode}
          onChapterUpdate={onChapterUpdate}
          translating={translating}
          isOriginalReadingMode={isOriginalReadingMode}
          onMarkAsTranslated={handleMarkAsTranslated}
          markingAsTranslated={markingAsTranslated}
        />

        {!isOriginalReadingMode && showTranslationPanel && (
          <TranslationPanel
            chapter={chapter}
            project={project}
            projectId={project.id}
            startTranslation={startTranslation}
            translating={translating}
            estimate={estimate}
            emptyCount={emptyParagraphIds.length}
            selectedParagraphIds={selectedParagraphIds}
            onSelectAllEmpty={handleSelectAllEmpty}
            onDeselectAll={handleDeselectAll}
            onCancelTranslation={handleCancelTranslation}
            onChapterUpdate={onChapterUpdate}
            onMarkAsTranslated={handleMarkAsTranslated}
            markingAsTranslated={markingAsTranslated}
          />
        )}

        {showSettings && (
          <ReaderSettingsPanel
            settings={readerSettings}
            onChange={handleReaderSettingsChange}
          />
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
          isTranslationOnlyDisplay={isTranslationOnlyDisplay}
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

export { ChapterHeader } from './ChapterHeader';
export { ReaderSettingsPanel } from './ReaderSettings';
export { ParagraphList } from './ParagraphList';
export { TranslationPanel } from './TranslationPanel';

