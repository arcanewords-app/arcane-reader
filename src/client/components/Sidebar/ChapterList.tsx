import { useState, useMemo, useRef } from 'preact/hooks';
import type { Chapter, ChapterStatus, Project } from '../../types';
import { Card, CountBadge } from '../ui';
import { api } from '../../api/client';
import './ChapterList.css';

type FilterType = 'all' | ChapterStatus;

interface ChapterListProps {
  chapters: Chapter[];
  selectedId: string | null;
  projectId: string | null;
  originalReadingMode?: boolean;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  onUpload: (file: File, title: string) => Promise<void>;
  onChaptersUpdate?: () => void | Promise<void>;
  onProjectUpdate?: (project: Project) => void;
}

export function ChapterList({
  chapters,
  selectedId,
  projectId,
  originalReadingMode = false,
  onSelect,
  onDelete,
  onUpload,
  onChaptersUpdate,
  onProjectUpdate,
}: ChapterListProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [dragover, setDragover] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingNumber, setEditingNumber] = useState<string | null>(null);
  const [editedNumber, setEditedNumber] = useState<number>(0);
  const [savingNumber, setSavingNumber] = useState(false);
  const [draggedChapterId, setDraggedChapterId] = useState<string | null>(null);
  const [dragOverChapterId, setDragOverChapterId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<{
    title: string;
    message: string;
    details?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const numberInputRef = useRef<HTMLInputElement>(null);

  // Sort chapters by number for display
  const sortedChapters = useMemo(() => {
    return [...chapters].sort((a, b) => a.number - b.number);
  }, [chapters]);

  const filteredChapters = useMemo(() => {
    return sortedChapters.filter((ch) => {
      const matchesFilter = filter === 'all' || ch.status === filter;
      const matchesSearch =
        !search || ch.title.toLowerCase().includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [sortedChapters, filter, search]);

  const counts = useMemo(() => ({
    all: chapters.length,
    pending: originalReadingMode ? 0 : chapters.filter((c) => c.status === 'pending').length,
    completed: originalReadingMode ? 0 : chapters.filter((c) => c.status === 'completed').length,
    error: originalReadingMode ? 0 : chapters.filter((c) => c.status === 'error').length,
  }), [chapters, originalReadingMode]);

  const handleFileSelect = async (file: File) => {
    const filename = file.name.toLowerCase();
    const supportedFormats = ['.txt', '.epub', '.fb2'];
    const isSupported = supportedFormats.some((ext) => filename.endsWith(ext));
    
    if (!file || !isSupported) {
      // Show error modal for unsupported format
      setError({
        title: 'Неподдерживаемый формат',
        message: 'Поддерживаемые форматы: .txt, .epub, .fb2',
        details: `Выбранный файл: ${file.name}`,
      });
      return;
    }
    
    setUploading(true);
    try {
      // For TXT files, extract title from filename
      // For EPUB/FB2, title will be extracted by server
      const title = filename.endsWith('.txt')
        ? file.name.replace('.txt', '').replace(/^\d+[._\-\s]*/, '')
        : `Глава ${chapters.length + 1}`;
      await onUpload(file, title || `Глава ${chapters.length + 1}`);
    } catch (error: any) {
      // Extract error details from ApiError
      const errorMessage = error?.message || 'Неизвестная ошибка';
      const errorDetails = error?.data?.details || error?.data?.parseErrors?.join('; ') || error?.data?.error;
      const parseErrors = error?.data?.parseErrors;
      const warnings = error?.data?.warnings;
      
      let detailsText = `Файл: ${file.name}`;
      if (errorDetails) {
        detailsText += `\n\n${errorDetails}`;
      }
      if (parseErrors && parseErrors.length > 0) {
        detailsText += `\n\nОшибки парсинга:\n${parseErrors.map((e: string, i: number) => `${i + 1}. ${e}`).join('\n')}`;
      }
      if (warnings && warnings.length > 0) {
        detailsText += `\n\nПредупреждения:\n${warnings.map((w: string, i: number) => `${i + 1}. ${w}`).join('\n')}`;
      }
      
      setError({
        title: 'Ошибка загрузки файла',
        message: errorMessage,
        details: detailsText,
      });
    } finally {
      setUploading(false);
    }
  };

  const handleFileDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragover(false);
    const file = e.dataTransfer?.files[0];
    if (file) handleFileSelect(file);
  };

  const handleFileDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragover(true);
  };

  const handleFileDragLeave = () => {
    setDragover(false);
  };

  const handleFileInput = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) handleFileSelect(file);
    input.value = ''; // Reset for same file
  };

  const getStatusIcon = (status: ChapterStatus) => {
    switch (status) {
      case 'completed': return '✅';
      case 'translating': return '🔮';
      case 'error': return '❌';
      default: return '⏳';
    }
  };

  const handleStartEditNumber = (chapter: Chapter, e: MouseEvent) => {
    e.stopPropagation();
    if (!projectId) return;
    setEditingNumber(chapter.id);
    setEditedNumber(chapter.number);
    // Focus input after state update
    setTimeout(() => {
      numberInputRef.current?.focus();
      numberInputRef.current?.select();
    }, 0);
  };

  const handleSaveNumber = async (chapterId: string) => {
    if (!projectId || savingNumber) return;
    
    const chapter = chapters.find(c => c.id === chapterId);
    if (!chapter) return;

    const newNumber = Math.max(1, Math.min(editedNumber, chapters.length));
    
    if (newNumber === chapter.number) {
      setEditingNumber(null);
      return;
    }

    setSavingNumber(true);
    try {
      // API returns updated Project with reordered chapters
      const updatedProject = await api.updateChapterNumber(projectId, chapterId, newNumber);
      // Update cache with the returned project immediately
      const { updateProjectCache } = await import('../../store/projects');
      updateProjectCache(updatedProject);
      // Update project state directly if callback provided (preferred)
      if (onProjectUpdate) {
        onProjectUpdate(updatedProject);
      } else if (onChaptersUpdate) {
        // Fallback: trigger chapters update callback (will fetch from API)
        await onChaptersUpdate();
      }
      setEditingNumber(null);
    } catch (error) {
      console.error('Failed to update chapter number:', error);
      alert(error instanceof Error ? error.message : 'Ошибка обновления номера');
      setEditedNumber(chapter.number);
    } finally {
      setSavingNumber(false);
    }
  };

  const handleCancelEditNumber = (chapter: Chapter) => {
    setEditingNumber(null);
    setEditedNumber(chapter.number);
  };

  const handleNumberKeyDown = (e: KeyboardEvent, chapterId: string) => {
    if (e.key === 'Enter') {
      handleSaveNumber(chapterId);
    } else if (e.key === 'Escape') {
      const chapter = chapters.find(c => c.id === chapterId);
      if (chapter) {
        handleCancelEditNumber(chapter);
      }
    }
  };

  const handleDragStart = (chapterId: string, e: DragEvent) => {
    e.stopPropagation();
    setDraggedChapterId(chapterId);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', chapterId);
    }
  };

  const handleChapterDragOver = (chapterId: string, e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    if (draggedChapterId && draggedChapterId !== chapterId) {
      setDragOverChapterId(chapterId);
    }
  };

  const handleChapterDragLeave = () => {
    setDragOverChapterId(null);
  };

  const handleChapterDrop = async (targetChapterId: string, e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverChapterId(null);

    if (!projectId || !draggedChapterId || draggedChapterId === targetChapterId) {
      setDraggedChapterId(null);
      return;
    }

    const draggedIndex = sortedChapters.findIndex(c => c.id === draggedChapterId);
    const targetIndex = sortedChapters.findIndex(c => c.id === targetChapterId);
    
    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedChapterId(null);
      return;
    }

    // Calculate new number based on target position
    // When dragging, we want to insert the dragged chapter BEFORE the target chapter
    // 
    // The key insight: newNumber is the desired FINAL position (1-based) after reordering
    // When dragging UP (draggedIndex > targetIndex):
    //   - We want to insert BEFORE target, so the dragged chapter takes target's position
    //   - Example: [1,2] drag 2→1: we want [2,1]
    //   - After removing chapter 2: [1]
    //   - Target (chapter 1) is at index 0, we want to insert BEFORE it at index 0
    //   - So newNumber = 1 (to insert at index 0, which is position 1)
    // 
    // When dragging DOWN (draggedIndex < targetIndex):
    //   - We want to insert BEFORE target, but target shifts after removal
    //   - Example: [1,2,3,4,5] drag 2→4: we want [1,3,4,2,5]
    //   - After removing chapter 2: [1,3,4,5]
    //   - Target (chapter 4) is now at index 2 (was 3), we want to insert BEFORE it at index 2
    //   - But we want final position 4, so newNumber = 4 (target's original position)
    // 
    // So for both cases: newNumber = targetIndex + 1 (target's current position)
    const newNumber = targetIndex + 1;

    // Update the dragged chapter's number to target position
    try {
      // API returns updated Project with reordered chapters
      const updatedProject = await api.updateChapterNumber(projectId, draggedChapterId, newNumber);
      
      // Update cache with the returned project immediately
      const { updateProjectCache } = await import('../../store/projects');
      updateProjectCache(updatedProject);
      
      // Update project state directly if callback provided (preferred)
      if (onProjectUpdate) {
        onProjectUpdate(updatedProject);
      } else if (onChaptersUpdate) {
        // Fallback: trigger chapters update callback (will fetch from API)
        await onChaptersUpdate();
      }
    } catch (error) {
      console.error('Failed to reorder chapter:', error);
      alert(error instanceof Error ? error.message : 'Ошибка изменения порядка');
    } finally {
      setDraggedChapterId(null);
    }
  };

  const handleDragEnd = () => {
    setDraggedChapterId(null);
    setDragOverChapterId(null);
  };

  return (
    <Card title={<>📖 Главы <CountBadge count={counts.all} /></>}>
      <div class="chapter-search">
        <input
          type="text"
          class="chapter-search-input"
          placeholder="🔍 Поиск..."
          value={search}
          onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="chapter-filters">
        {(['all', ...(originalReadingMode ? [] : ['pending', 'completed', 'error'] as FilterType[])] as FilterType[]).map((f) => (
          <button
            key={f}
            class={`chapter-filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'Все' : f === 'pending' ? '⏳' : f === 'completed' ? '✅' : '❌'}
          </button>
        ))}
      </div>

      <div class="chapter-list">
        {filteredChapters.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-dim)' }}>
            {chapters.length === 0 ? 'Нет глав' : 'Нет результатов'}
          </div>
        ) : (
          filteredChapters.map((chapter) => (
            <div
              key={chapter.id}
              class={`chapter-item ${selectedId === chapter.id ? 'active' : ''} ${draggedChapterId === chapter.id ? 'dragging' : ''} ${dragOverChapterId === chapter.id ? 'drag-over' : ''}`}
              onClick={() => onSelect(chapter.id)}
              draggable={!editingNumber}
              onDragStart={(e) => handleDragStart(chapter.id, e)}
              onDragOver={(e) => handleChapterDragOver(chapter.id, e)}
              onDragLeave={handleChapterDragLeave}
              onDrop={(e) => handleChapterDrop(chapter.id, e)}
              onDragEnd={handleDragEnd}
              style={{
                opacity: draggedChapterId === chapter.id ? 0.5 : 1,
                cursor: editingNumber ? 'default' : 'grab',
              }}
            >
              {editingNumber === chapter.id ? (
                <div class="chapter-number-edit" onClick={(e) => e.stopPropagation()}>
                  <input
                    ref={editingNumber === chapter.id ? numberInputRef : undefined}
                    type="number"
                    min="1"
                    max={chapters.length}
                    value={editedNumber}
                    onInput={(e) => {
                      const value = parseInt((e.target as HTMLInputElement).value, 10);
                      if (!isNaN(value)) {
                        setEditedNumber(Math.max(1, Math.min(value, chapters.length)));
                      }
                    }}
                    onKeyDown={(e) => handleNumberKeyDown(e, chapter.id)}
                    onBlur={() => handleSaveNumber(chapter.id)}
                    disabled={savingNumber}
                    class="chapter-number-input"
                    style={{ width: '3rem', textAlign: 'center' }}
                  />
                  <div class="chapter-number-edit-actions">
                    <button
                      class="chapter-number-save-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSaveNumber(chapter.id);
                      }}
                      disabled={savingNumber}
                      title="Сохранить (Enter)"
                    >
                      ✓
                    </button>
                    <button
                      class="chapter-number-cancel-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCancelEditNumber(chapter);
                      }}
                      disabled={savingNumber}
                      title="Отмена (Esc)"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ) : (
                <span
                  class="chapter-number"
                  onClick={(e) => handleStartEditNumber(chapter, e)}
                  title="Кликните для редактирования номера"
                  style={{ cursor: 'pointer' }}
                >
                  {chapter.number}
                </span>
              )}
              <span class="chapter-item-title">{chapter.title}</span>
              <div class="chapter-item-actions">
                {!originalReadingMode && (
                  <span>{getStatusIcon(chapter.status)}</span>
                )}
                {onDelete && (
                  <button
                    class="chapter-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmId(chapter.id);
                    }}
                    title="Удалить"
                    disabled={deleting}
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div
        class={`upload-area ${dragover ? 'dragover' : ''}`}
        style={{ marginTop: '1rem' }}
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleFileDrop}
        onDragOver={handleFileDragOver}
        onDragLeave={handleFileDragLeave}
      >
        {uploading ? (
          <span class="spinner" />
        ) : (
          <>
            <div class="upload-icon">📄</div>
            <p>Перетащите файл<br />(.txt, .epub, .fb2)<br />или нажмите</p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.epub,.fb2"
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />
        {error && (
          <div class="error-modal-overlay" onClick={() => setError(null)}>
            <div class="error-modal" onClick={(e) => e.stopPropagation()}>
              <div class="error-modal-header">
                <h3>{error.title}</h3>
                <button class="error-modal-close" onClick={() => setError(null)}>
                  ×
                </button>
              </div>
              <div class="error-modal-body">
                <p>{error.message}</p>
                {error.details && (
                  <pre class="error-details">{error.details}</pre>
                )}
              </div>
              <div class="error-modal-footer">
                <button onClick={() => setError(null)}>Закрыть</button>
              </div>
            </div>
          </div>
        )}

        {deleteConfirmId && (
          <div class="error-modal-overlay" onClick={() => setDeleteConfirmId(null)}>
            <div class="error-modal" onClick={(e) => e.stopPropagation()}>
              <div class="error-modal-header">
                <h3>Удалить главу?</h3>
                <button 
                  class="error-modal-close" 
                  onClick={() => setDeleteConfirmId(null)}
                  disabled={deleting}
                >
                  ×
                </button>
              </div>
              <div class="error-modal-body">
                <p>
                  Вы уверены, что хотите удалить главу "{sortedChapters.find(c => c.id === deleteConfirmId)?.title || 'Неизвестная глава'}"?
                </p>
                <p style={{ color: 'var(--error)', fontSize: '0.9rem', marginTop: '1rem' }}>
                  ⚠️ Это действие нельзя отменить. Все данные главы будут удалены.
                </p>
              </div>
              <div class="error-modal-footer">
                <button 
                  onClick={() => setDeleteConfirmId(null)}
                  disabled={deleting}
                  style={{ marginRight: '0.5rem' }}
                >
                  Отмена
                </button>
                <button 
                  onClick={async () => {
                    if (!onDelete || !deleteConfirmId) return;
                    setDeleting(true);
                    try {
                      await onDelete(deleteConfirmId);
                      setDeleteConfirmId(null);
                    } catch (error) {
                      console.error('Failed to delete chapter:', error);
                      setError({
                        title: 'Ошибка удаления',
                        message: error instanceof Error ? error.message : 'Не удалось удалить главу',
                      });
                    } finally {
                      setDeleting(false);
                    }
                  }}
                  disabled={deleting}
                  style={{ 
                    background: 'var(--error)', 
                    color: 'white',
                    opacity: deleting ? 0.6 : 1
                  }}
                >
                  {deleting ? 'Удаление...' : 'Удалить'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

