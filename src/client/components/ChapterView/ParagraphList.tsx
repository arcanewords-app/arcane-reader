import { useState, useRef, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { Paragraph } from '../../types';
import './ParagraphList.css';

interface ParagraphListProps {
  paragraphs: Paragraph[];
  onSave: (id: string, text: string) => Promise<void>;
  isOriginalReadingMode?: boolean;
  /** Show only translation column (1 column) - for chapters with uploaded translation, no original */
  isTranslationOnlyDisplay?: boolean;
  /** IDs of paragraphs that are empty (no valid translation) - show checkbox for selection */
  emptyParagraphIds?: string[];
  /** Selected paragraph IDs for "translate selected" */
  selectedParagraphIds?: string[];
  onToggleParagraphSelection?: (id: string) => void;
}

export function ParagraphList({
  paragraphs,
  onSave,
  isOriginalReadingMode = false,
  isTranslationOnlyDisplay = false,
  emptyParagraphIds = [],
  selectedParagraphIds = [],
  onToggleParagraphSelection,
}: ParagraphListProps) {
  const { t } = useTranslation();
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

  const singleColumn = isOriginalReadingMode || isTranslationOnlyDisplay;

  return (
    <div class="text-panel-unified">
      <div class="panel-headers">
        {!isTranslationOnlyDisplay && (
          <div class="panel-header-left" style={singleColumn ? { width: '100%' } : {}}>
            🇬🇧 Оригинал (English)
            <span class="panel-stats">{originalChars.toLocaleString()} {t('paragraphList.characters')}</span>
          </div>
        )}
        {(isTranslationOnlyDisplay || !isOriginalReadingMode) && (
          <div class={`panel-header-right ${isTranslationOnlyDisplay ? 'panel-header-full' : ''}`} style={isTranslationOnlyDisplay ? { width: '100%' } : {}}>
            🇷🇺 Перевод (Русский)
            <span class="panel-stats">{translatedChars.toLocaleString()} {t('paragraphList.characters')}</span>
          </div>
        )}
      </div>

      <div class="paragraphs-unified">
        {paragraphs.map((paragraph, index) => {
          const isEmpty = emptyParagraphIds.includes(paragraph.id);
          const showCheckbox = !isOriginalReadingMode && !isTranslationOnlyDisplay && isEmpty && onToggleParagraphSelection;
          const isSelected = selectedParagraphIds.includes(paragraph.id);
          return (
          <div
            key={paragraph.id}
            class={`paragraph-row ${highlightedId === paragraph.id ? 'highlighted' : ''} ${isTranslationOnlyDisplay ? 'paragraph-row-translation-only' : ''}`}
            style={singleColumn ? { gridTemplateColumns: '1fr' } : {}}
            onMouseEnter={() => setHighlightedId(paragraph.id)}
            onMouseLeave={() => setHighlightedId(null)}
          >
            {/* Original - hidden in original reading mode and translation-only display */}
            {!isTranslationOnlyDisplay && (
            <div class="paragraph-cell paragraph-cell-original" style={singleColumn ? { width: '100%' } : {}}>
              {showCheckbox && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                    marginRight: '0.35rem',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleParagraphSelection?.(paragraph.id)}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                </label>
              )}
              <span class="paragraph-index">{index + 1}</span>
              <div class="paragraph-text">{paragraph.originalText}</div>
            </div>
            )}

            {/* Translation - hidden only in original reading mode */}
            {(!isOriginalReadingMode || isTranslationOnlyDisplay) && (
            <div class="paragraph-cell paragraph-cell-translation" style={isTranslationOnlyDisplay ? { width: '100%' } : {}}>
              {isTranslationOnlyDisplay && (
                <span class="paragraph-index">{index + 1}</span>
              )}
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
                      {t('common.cancel')}
                    </button>
                    <button
                      class="btn btn-primary btn-sm"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? <span class="spinner" /> : `💾 ${t('paragraphList.save')}`}
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
                      : `<em>${t('paragraphList.clickToEdit')}</em>`,
                  }}
                />
              )}
            </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}

