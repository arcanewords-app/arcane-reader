import { useState, useEffect } from 'preact/hooks';
import type { Chapter, Project, ReaderSettings } from '../../types';
import { api } from '../../api/client';
import { Card } from '../ui';
import { ChapterHeader } from './ChapterHeader';
import { ReaderSettingsPanel } from './ReaderSettings';
import { ParagraphList } from './ParagraphList';

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
  const [showSettings, setShowSettings] = useState(false);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(
    project.settings.reader || defaultReaderSettings
  );
  const [translating, setTranslating] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<number | null>(null);

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

  const handleTranslate = async () => {
    // Prevent double-translation
    if (chapter.status === 'translating' || translating) {
      console.warn('⚠️ Translation already in progress, status:', chapter.status);
      return;
    }

    console.log('🔮 Starting translation for chapter:', chapter.id, chapter.title);
    setTranslating(true);
    
    try {
      const response = await api.translateChapter(project.id, chapter.id);
      console.log('✅ Translation request sent, response:', response);
      
      // Immediately update chapter status to translating to trigger polling
      const updatedChapter = { ...chapter, status: 'translating' as const };
      onChapterUpdate(updatedChapter);
      
      console.log('📊 Chapter status updated to "translating", polling should start');
      
      // Polling will handle the rest via useEffect
    } catch (error) {
      console.error('❌ Translation error:', error);
      setTranslating(false);
      
      // Update chapter status to error if translation failed
      const errorChapter = { ...chapter, status: 'error' as const };
      onChapterUpdate(errorChapter);
      
      // Show user-friendly error message
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      alert(`Ошибка запуска перевода: ${errorMessage}`);
      console.error('Full error details:', error);
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
          onApproveAll={handleApproveAll}
          onToggleSettings={() => setShowSettings(!showSettings)}
          onEnterReadingMode={onEnterReadingMode}
          onChapterUpdate={onChapterUpdate}
          translating={translating || chapter.status === 'translating'}
        />

        {showSettings && (
          <ReaderSettingsPanel
            settings={readerSettings}
            onChange={handleReaderSettingsChange}
          />
        )}

        {/* Progress bar */}
        {paragraphs.length > 0 && (
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
        <ParagraphList paragraphs={paragraphs} onSave={handleSaveParagraph} />
      ) : (
        <Card>
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
            <p>Нет абзацев для отображения.</p>
            <p style={{ marginTop: '0.5rem' }}>
              Нажмите "Перевести" для начала обработки.
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

