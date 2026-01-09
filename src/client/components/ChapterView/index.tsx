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
    if (chapter.status === 'translating' && !pollingInterval) {
      const interval = window.setInterval(async () => {
        try {
          const updated = await api.getChapter(project.id, chapter.id);
          onChapterUpdate(updated);
          if (updated.status !== 'translating') {
            clearInterval(interval);
            setPollingInterval(null);
            setTranslating(false);
          }
        } catch (error) {
          console.error('Polling error:', error);
        }
      }, 2000);
      setPollingInterval(interval);
    }

    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [chapter.status, chapter.id, project.id]);

  const handleTranslate = async () => {
    setTranslating(true);
    try {
      await api.translateChapter(project.id, chapter.id);
      // Polling will handle the rest
    } catch (error) {
      console.error('Translation error:', error);
      setTranslating(false);
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
          canPrev={chapterIndex > 0}
          canNext={chapterIndex < totalChapters - 1}
          onPrev={onPrev}
          onNext={onNext}
          onTranslate={handleTranslate}
          onApproveAll={handleApproveAll}
          onToggleSettings={() => setShowSettings(!showSettings)}
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

