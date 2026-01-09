import { useState, useMemo, useRef } from 'preact/hooks';
import type { Chapter, ChapterStatus } from '../../types';
import { Card, CountBadge } from '../ui';

type FilterType = 'all' | ChapterStatus;

interface ChapterListProps {
  chapters: Chapter[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  onUpload: (file: File, title: string) => Promise<void>;
}

export function ChapterList({
  chapters,
  selectedId,
  onSelect,
  onDelete,
  onUpload,
}: ChapterListProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [dragover, setDragover] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredChapters = useMemo(() => {
    return chapters.filter((ch) => {
      const matchesFilter = filter === 'all' || ch.status === filter;
      const matchesSearch =
        !search || ch.title.toLowerCase().includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [chapters, filter, search]);

  const counts = useMemo(() => ({
    all: chapters.length,
    pending: chapters.filter((c) => c.status === 'pending').length,
    completed: chapters.filter((c) => c.status === 'completed').length,
    error: chapters.filter((c) => c.status === 'error').length,
  }), [chapters]);

  const handleFileSelect = async (file: File) => {
    if (!file || !file.name.endsWith('.txt')) return;
    
    setUploading(true);
    try {
      const title = file.name.replace('.txt', '').replace(/^\d+[._\-\s]*/, '');
      await onUpload(file, title || `Глава ${chapters.length + 1}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragover(false);
    const file = e.dataTransfer?.files[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragover(true);
  };

  const handleDragLeave = () => {
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
        {(['all', 'pending', 'completed', 'error'] as FilterType[]).map((f) => (
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
              class={`chapter-item ${selectedId === chapter.id ? 'active' : ''}`}
              onClick={() => onSelect(chapter.id)}
            >
              <span class="chapter-number">{chapter.number}</span>
              <span class="chapter-item-title">{chapter.title}</span>
              <div class="chapter-item-actions">
                <span>{getStatusIcon(chapter.status)}</span>
                {onDelete && (
                  <button
                    class="chapter-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(chapter.id);
                    }}
                    title="Удалить"
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
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {uploading ? (
          <span class="spinner" />
        ) : (
          <>
            <div class="upload-icon">📄</div>
            <p>Перетащите .txt файл<br />или нажмите</p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt"
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />
      </div>
    </Card>
  );
}

