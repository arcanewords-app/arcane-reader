import { useState, useRef, useEffect } from 'preact/hooks';
import type { Paragraph } from '../../types';
import './ParagraphList.css';

interface ParagraphListProps {
  paragraphs: Paragraph[];
  onSave: (id: string, text: string) => Promise<void>;
}

export function ParagraphList({ paragraphs, onSave }: ParagraphListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [editText]);

  const startEditing = (paragraph: Paragraph) => {
    setEditingId(paragraph.id);
    setEditText(paragraph.translatedText || '');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditText('');
  };

  const handleSave = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await onSave(editingId, editText);
      setEditingId(null);
      setEditText('');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      cancelEditing();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave();
    }
  };

  const escapeHtml = (text: string) => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  // Calculate stats
  const originalChars = paragraphs.reduce((sum, p) => sum + p.originalText.length, 0);
  const translatedChars = paragraphs.reduce(
    (sum, p) => sum + (p.translatedText?.length || 0),
    0
  );

  return (
    <div class="text-panel-unified">
      <div class="panel-headers">
        <div class="panel-header-left">
          🇬🇧 Оригинал (English)
          <span class="panel-stats">{originalChars.toLocaleString()} символов</span>
        </div>
        <div class="panel-header-right">
          🇷🇺 Перевод (Русский)
          <span class="panel-stats">{translatedChars.toLocaleString()} символов</span>
        </div>
      </div>

      <div class="paragraphs-unified">
        {paragraphs.map((paragraph, index) => (
          <div
            key={paragraph.id}
            class={`paragraph-row ${highlightedId === paragraph.id ? 'highlighted' : ''}`}
            onMouseEnter={() => setHighlightedId(paragraph.id)}
            onMouseLeave={() => setHighlightedId(null)}
          >
            {/* Original */}
            <div class="paragraph-cell paragraph-cell-original">
              <span class="paragraph-index">{index + 1}</span>
              <div class="paragraph-text">{paragraph.originalText}</div>
            </div>

            {/* Translation */}
            <div class="paragraph-cell paragraph-cell-translation">
              {editingId === paragraph.id ? (
                <div>
                  <textarea
                    ref={textareaRef}
                    class="paragraph-editor"
                    value={editText}
                    onInput={(e) => setEditText((e.target as HTMLTextAreaElement).value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                  />
                  <div class="paragraph-actions">
                    <button class="btn btn-secondary btn-sm" onClick={cancelEditing}>
                      Отмена
                    </button>
                    <button
                      class="btn btn-primary btn-sm"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? <span class="spinner" /> : '💾 Сохранить'}
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  class={`paragraph-text editable ${
                    !paragraph.translatedText ? 'empty' : ''
                  }`}
                  onClick={() => startEditing(paragraph)}
                  dangerouslySetInnerHTML={{
                    __html: paragraph.translatedText
                      ? escapeHtml(paragraph.translatedText)
                      : '<em>Нажмите для редактирования...</em>',
                  }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

