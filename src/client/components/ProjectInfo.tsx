import { useState, useRef, useCallback } from 'preact/hooks';
import type { Project, ProjectSettings, Chapter } from '../types';
import { Card, Button, Modal } from './ui';
import { api } from '../api/client';

interface ProjectInfoProps {
  project: Project;
  onSettingsChange: (settings: ProjectSettings) => void;
  onDelete: () => void;
  onRefreshProject: () => Promise<void>;
  onEnterReadingMode: () => void;
}

export function ProjectInfo({ project, onSettingsChange, onDelete, onRefreshProject, onEnterReadingMode }: ProjectInfoProps) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showTranslateAllModal, setShowTranslateAllModal] = useState(false);
  const [exporting, setExporting] = useState<'epub' | 'fb2' | null>(null);
  interface ChapterProgress {
    chapterId: string;
    title: string;
    status: 'pending' | 'translating' | 'completed' | 'error';
    tokensUsed?: number;
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

  const stats = {
    chapters: project.chapters.length,
    translated: project.chapters.filter((c) => c.status === 'completed').length,
    pending: project.chapters.filter((c) => c.status === 'pending').length,
    glossary: project.glossary.length,
  };

  const settings = project.settings;

  const handleModelChange = async (e: Event) => {
    const model = (e.target as HTMLSelectElement).value;
    const updated = await api.updateSettings(project.id, { model });
    onSettingsChange(updated);
  };

  const handleTemperatureChange = async (e: Event) => {
    const value = parseInt((e.target as HTMLInputElement).value, 10);
    const temperature = value / 100;
    const updated = await api.updateSettings(project.id, { temperature });
    onSettingsChange(updated);
  };

  const toggleStage = async (stage: 'analysis' | 'editing') => {
    const key = stage === 'analysis' ? 'enableAnalysis' : 'enableEditing';
    const current = settings[key] ?? true;
    const updated = await api.updateSettings(project.id, { [key]: !current });
    onSettingsChange(updated);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteProject(project.id);
      setShowDeleteModal(false);
      onDelete();
    } catch (error) {
      console.error('Failed to delete project:', error);
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = async (format: 'epub' | 'fb2') => {
    if (stats.translated === 0) {
      alert('Нет переведенных глав для экспорта');
      return;
    }

    setExporting(format);
    try {
      const result = await api.exportProject(project.id, format);
      
      // Create download link and trigger download
      const link = document.createElement('a');
      link.href = result.url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      console.log(`✅ Экспорт ${format.toUpperCase()} завершен: ${result.filename}`);
    } catch (error: any) {
      console.error(`Failed to export ${format}:`, error);
      alert(error.message || `Ошибка при экспорте в ${format.toUpperCase()}`);
    } finally {
      setExporting(null);
    }
  };

  // Poll chapter status until translation completes
  const pollChapterStatus = async (
    chapterId: string,
    maxAttempts: number = 60
  ): Promise<{ success: boolean; chapter?: Chapter; error?: string }> => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (cancelledRef.current) {
        return { success: false, error: 'Отменено пользователем' };
      }

      try {
        const chapter = await api.getChapter(project.id, chapterId);
        
        if (chapter.status === 'completed') {
          return { success: true, chapter };
        }
        
        if (chapter.status === 'error') {
          return { success: false, error: 'Ошибка перевода' };
        }

        // Wait 2 seconds before next poll
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error('Polling error:', error);
        return { success: false, error: 'Ошибка проверки статуса' };
      }
    }

    return { success: false, error: 'Превышено время ожидания' };
  };

  // Translate all pending chapters sequentially
  const handleTranslateAll = async () => {
    const pendingChapters = project.chapters.filter((c) => c.status === 'pending');
    
    if (pendingChapters.length === 0) {
      return;
    }

    setShowTranslateAllModal(false);
    cancelledRef.current = false;
    
    // Store initial glossary count
    initialGlossaryCountRef.current = project.glossary.length;
    
    // Initialize chapters progress
    const chaptersProgress: ChapterProgress[] = pendingChapters.map((ch) => ({
      chapterId: ch.id,
      title: ch.title,
      status: 'pending',
    }));
    
    setTranslationProgress({
      current: 0,
      total: pendingChapters.length,
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
      for (let i = 0; i < pendingChapters.length; i++) {
        if (cancelledRef.current) {
          break;
        }

        const chapter = pendingChapters[i];
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
        } catch (error) {
          console.error(`Translation error for chapter ${chapter.id}:`, error);
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
    }
  };

  const handleCancelTranslation = useCallback(() => {
    cancelledRef.current = true;
    setTranslationProgress(null);
  }, []);

  const handleCloseTranslation = useCallback(() => {
    setTranslationProgress(null);
    cancelledRef.current = false;
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
            <span style={{ color: 'var(--text-dim)' }}>EN → RU</span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setShowDeleteModal(true)}>
            🗑️ Удалить
          </Button>
        </div>

        <div class="stats">
          <div class="stat-item">
            <div class="stat-value">{stats.chapters}</div>
            <div class="stat-label">Глав</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">{stats.translated}</div>
            <div class="stat-label">Переведено</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">{stats.glossary}</div>
            <div class="stat-label">В глоссарии</div>
          </div>
        </div>

        {/* Translate All Button */}
        {stats.pending > 0 && (
          <div style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
            <Button
              variant="primary"
              size="full"
              onClick={() => setShowTranslateAllModal(true)}
              disabled={translationProgress !== null}
            >
              🔮 Перевести все ({stats.pending} глав)
            </Button>
          </div>
        )}

        {/* Reading Mode Button */}
        {stats.translated > 0 && (
          <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
            <Button
              variant="secondary"
              size="full"
              onClick={onEnterReadingMode}
            >
              📖 Режим чтения ({stats.translated} глав)
            </Button>
          </div>
        )}

        {/* Export Buttons */}
        {stats.translated > 0 && (
          <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
              <Button
                variant="secondary"
                size="full"
                onClick={() => handleExport('epub')}
                loading={exporting === 'epub'}
                disabled={exporting !== null}
                title="Экспортировать в EPUB"
              >
                📚 Экспорт EPUB
              </Button>
              <Button
                variant="secondary"
                size="full"
                onClick={() => handleExport('fb2')}
                loading={exporting === 'fb2'}
                disabled={exporting !== null}
                title="Экспортировать в FB2"
              >
                📖 Экспорт FB2
              </Button>
            </div>
          </div>
        )}

        {/* Settings Panel */}
        <div class="settings-panel">
          <div class="setting-group">
            <label class="setting-label">🤖 Модель</label>
            <select
              class="setting-select"
              value={settings.model}
              onChange={handleModelChange}
            >
              <option value="gpt-4-turbo-preview">GPT-4 Turbo</option>
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-4o-mini">GPT-4o Mini (быстрая)</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo (экономная)</option>
            </select>
            <span class="setting-hint">Влияет на качество и стоимость</span>
          </div>
          <div class="setting-group">
            <label class="setting-label">🎨 Креативность</label>
            <div class="slider-container">
              <input
                type="range"
                class="slider"
                min="0"
                max="100"
                value={Math.round(settings.temperature * 100)}
                onInput={(e) => {
                  const value = parseInt((e.target as HTMLInputElement).value, 10);
                  // Update display immediately
                  const display = e.currentTarget.parentElement?.querySelector('.slider-value');
                  if (display) display.textContent = (value / 100).toFixed(1);
                }}
                onChange={handleTemperatureChange}
              />
              <span class="slider-value">{settings.temperature.toFixed(1)}</span>
            </div>
            <span class="setting-hint">0 = точный, 1 = творческий</span>
          </div>
        </div>

        {/* Pipeline Stages */}
        <div class="stages-panel">
          <div class="stages-title">⚙️ Этапы перевода</div>
          <div class="stages-grid">
            <div
              class={`stage-toggle ${settings.enableAnalysis !== false ? 'active' : ''}`}
              onClick={() => toggleStage('analysis')}
            >
              <span class="stage-checkbox">✓</span>
              <span class="stage-icon">🔍</span>
              <span class="stage-name">Анализ</span>
            </div>
            <span class="stage-arrow">→</span>
            <div class="stage-toggle active disabled">
              <span class="stage-checkbox">✓</span>
              <span class="stage-icon">🔮</span>
              <span class="stage-name">Перевод</span>
            </div>
            <span class="stage-arrow">→</span>
            <div
              class={`stage-toggle ${settings.enableEditing !== false ? 'active' : ''}`}
              onClick={() => toggleStage('editing')}
            >
              <span class="stage-checkbox">✓</span>
              <span class="stage-icon">✨</span>
              <span class="stage-name">Редактура</span>
            </div>
          </div>
          <span class="setting-hint" style={{ display: 'block', marginTop: '0.5rem' }}>
            Нажмите, чтобы включить/выключить этапы. Перевод всегда обязателен.
          </span>
        </div>
      </Card>

      {/* Delete Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="🗑️ Удалить проект?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
              Отмена
            </Button>
            <Button onClick={handleDelete} loading={deleting}>
              Удалить
            </Button>
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)' }}>
          Вы уверены, что хотите удалить проект <strong>{project.name}</strong>?
          Это действие нельзя отменить.
        </p>
      </Modal>

      {/* Translate All Confirmation Modal */}
      <Modal
        isOpen={showTranslateAllModal}
        onClose={() => setShowTranslateAllModal(false)}
        title="🔮 Перевести все главы?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowTranslateAllModal(false)}>
              Отмена
            </Button>
            <Button onClick={handleTranslateAll}>
              Начать перевод
            </Button>
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)' }}>
          Будут переведены все <strong>{stats.pending}</strong> главы со статусом "Ожидает".
          Перевод выполняется последовательно, одна глава за другой.
        </p>
      </Modal>

      {/* Translation Progress Modal */}
      <Modal
        isOpen={translationProgress !== null}
        onClose={isTranslationComplete ? handleCloseTranslation : handleCancelTranslation}
        title="🔮 Перевод глав"
        className="translation-progress-modal"
        preventClose={!isTranslationComplete}
      >
        {translationProgress && (
          <div>
            {/* Overall Progress */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>
                  Прогресс: {translationProgress.current} / {translationProgress.total}
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
                Стадии перевода:
              </div>
              <div class="stages-grid" style={{ gap: '0.5rem' }}>
                <div class={`stage-toggle ${settings.enableAnalysis !== false ? 'active' : ''}`} style={{ cursor: 'default', opacity: settings.enableAnalysis !== false ? 1 : 0.5 }}>
                  <span class="stage-icon">🔍</span>
                  <span class="stage-name">Анализ</span>
                </div>
                <span class="stage-arrow">→</span>
                <div class="stage-toggle active" style={{ cursor: 'default' }}>
                  <span class="stage-icon">🔮</span>
                  <span class="stage-name">Перевод</span>
                </div>
                <span class="stage-arrow">→</span>
                <div class={`stage-toggle ${settings.enableEditing !== false ? 'active' : ''}`} style={{ cursor: 'default', opacity: settings.enableEditing !== false ? 1 : 0.5 }}>
                  <span class="stage-icon">✨</span>
                  <span class="stage-name">Редактура</span>
                </div>
              </div>
            </div>

            {/* Current Chapter Info */}
            {translationProgress.currentChapter && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-hover)', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>
                  Текущая глава:
                </div>
                <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{translationProgress.currentChapter}</div>
                
                {(() => {
                  const currentChapterProgress = translationProgress.chapters.find(
                    (ch) => ch.chapterId === translationProgress.currentChapterId
                  );
                  
                  if (currentChapterProgress?.tokensUsed || currentChapterProgress?.duration) {
                    return (
                      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {currentChapterProgress.duration && (
                          <span>⏱️ {(currentChapterProgress.duration / 1000).toFixed(1)}s</span>
                        )}
                        {currentChapterProgress.tokensUsed && (
                          <span>📝 {currentChapterProgress.tokensUsed.toLocaleString()} токенов</span>
                        )}
                        {currentChapterProgress.glossaryEntries !== undefined && currentChapterProgress.glossaryEntries > 0 && (
                          <span>📚 +{currentChapterProgress.glossaryEntries} в глоссарии</span>
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
                <div style={{ color: 'var(--text-dim)', marginBottom: '0.5rem' }}>Общая статистика:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', color: 'var(--text-secondary)' }}>
                  {translationProgress.totalDuration > 0 && (
                    <span>⏱️ {(translationProgress.totalDuration / 1000).toFixed(1)}s</span>
                  )}
                  {translationProgress.totalTokens > 0 && (
                    <span>📝 {translationProgress.totalTokens.toLocaleString()} токенов</span>
                  )}
                  {translationProgress.totalGlossaryEntries > 0 && (
                    <span>📚 +{translationProgress.totalGlossaryEntries} записей в глоссарии</span>
                  )}
                </div>
              </div>
            )}

            {/* Summary */}
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              <div style={{ color: 'var(--success)' }}>
                ✅ Завершено: {translationProgress.completed}
              </div>
              {translationProgress.errors > 0 && (
                <div style={{ color: 'var(--error)' }}>
                  ❌ Ошибок: {translationProgress.errors}
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
                  Закрыть
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCancelTranslation}
                  style={{ width: '100%' }}
                >
                  Отменить
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

