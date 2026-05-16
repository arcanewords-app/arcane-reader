import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { Paragraph, TextBlockType } from '../../types';
import type { SearchHighlight } from '../SearchReplace';
import { Icon } from '../ui';
import { renderTextWithBlocks } from '../../utils/text-blocks';
import './ParagraphList.css';

/** Virtualization: enable when paragraph count exceeds this. */
const VIRTUAL_THRESHOLD = 80;
/** Estimated row height for virtualized list (px). Used when row not yet measured. */
const EST_ROW_HEIGHT = 80;
/** Buffer items above/below viewport. */
const VIRTUAL_BUFFER = 5;

/** Compute accumulated heights and visible range for variable-height virtualization. */
function computeVirtualRange(
  count: number,
  scrollTop: number,
  containerHeight: number,
  getHeight: (i: number) => number
): {
  totalHeight: number;
  accumulated: number[];
  startIndex: number;
  endIndex: number;
  paddingTop: number;
  paddingBottom: number;
} {
  const acc: number[] = [0];
  for (let i = 0; i < count; i++) {
    acc.push(acc[acc.length - 1] + getHeight(i));
  }
  const totalHeight = acc[count];
  let startIndex = count - 1;
  for (let i = 0; i < count; i++) {
    if (acc[i + 1] > scrollTop) {
      startIndex = i;
      break;
    }
  }
  let endIndex = 0;
  for (let i = count - 1; i >= 0; i--) {
    if (acc[i] < scrollTop + containerHeight) {
      endIndex = i;
      break;
    }
  }
  startIndex = Math.max(0, startIndex - VIRTUAL_BUFFER);
  endIndex = Math.min(count - 1, endIndex + VIRTUAL_BUFFER);
  if (startIndex > endIndex) startIndex = endIndex;
  const paddingTop = acc[startIndex];
  const paddingBottom = totalHeight - acc[Math.min(endIndex + 1, count)];
  return { totalHeight, accumulated: acc, startIndex, endIndex, paddingTop, paddingBottom };
}

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
  /** Text block types for special formatting (system messages, notes, etc.) */
  textBlockTypes?: TextBlockType[];
  /** Search highlight: which paragraphs match, which to scroll to */
  searchHighlight?: SearchHighlight | null;
  /** Ref to receive scroll-to-paragraph function (called when user clicks search result row) */
  scrollToParagraphRef?: { current: ((id: string) => void) | null };
}

export function ParagraphList({
  paragraphs,
  onSave,
  isOriginalReadingMode = false,
  isTranslationOnlyDisplay = false,
  emptyParagraphIds = [],
  selectedParagraphIds = [],
  onToggleParagraphSelection,
  textBlockTypes = [],
  searchHighlight,
  scrollToParagraphRef,
}: ParagraphListProps) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(400);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollTopRafRef = useRef<number | null>(null);
  const rowHeightsRef = useRef<Map<number, number>>(new Map());
  const rowRefsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const [, setMeasurementVersion] = useState(0);
  const measurementRafRef = useRef<number | null>(null);

  const useVirtualization = paragraphs.length > VIRTUAL_THRESHOLD;

  const getRowHeight = useCallback(
    (i: number) => rowHeightsRef.current.get(i) ?? EST_ROW_HEIGHT,
    []
  );

  const virtualRange = useVirtualization
    ? computeVirtualRange(paragraphs.length, scrollTop, containerHeight, getRowHeight)
    : null;

  const totalHeight = virtualRange?.totalHeight ?? 0;
  const startIndex = virtualRange?.startIndex ?? 0;
  const endIndex = virtualRange ? virtualRange.endIndex + 1 : paragraphs.length; // endIndex is inclusive, slice needs exclusive
  const paddingTop = virtualRange?.paddingTop ?? 0;
  const paddingBottom = virtualRange?.paddingBottom ?? 0;
  const visibleParagraphs = useVirtualization ? paragraphs.slice(startIndex, endIndex) : paragraphs;

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (scrollTopRafRef.current !== null) return;
    scrollTopRafRef.current = requestAnimationFrame(() => {
      scrollTopRafRef.current = null;
      setScrollTop(el.scrollTop);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (scrollTopRafRef.current !== null) cancelAnimationFrame(scrollTopRafRef.current);
    };
  }, []);

  // Clear measured heights when chapter/paragraphs change
  const firstParagraphId = paragraphs[0]?.id ?? '';
  useEffect(() => {
    rowHeightsRef.current.clear();
    rowRefsRef.current.clear();
  }, [firstParagraphId]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !useVirtualization) return;
    const ro = new ResizeObserver(() => {
      setContainerHeight(el.clientHeight);
    });
    ro.observe(el);
    setContainerHeight(el.clientHeight);
    return () => ro.disconnect();
  }, [useVirtualization]);

  // ResizeObserver for variable-height rows: measure each visible row and batch re-renders
  const rowObserverRef = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    if (!useVirtualization) return;
    const scheduleMeasurementUpdate = () => {
      if (measurementRafRef.current !== null) return;
      measurementRafRef.current = requestAnimationFrame(() => {
        measurementRafRef.current = null;
        setMeasurementVersion((v) => v + 1);
      });
    };
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const idx = parseInt((entry.target as HTMLElement).dataset.rowIndex ?? '', 10);
        if (!Number.isNaN(idx)) {
          rowHeightsRef.current.set(idx, entry.contentRect.height);
        }
      }
      scheduleMeasurementUpdate();
    });
    rowObserverRef.current = observer;
    for (const [idx, el] of rowRefsRef.current) {
      el.dataset.rowIndex = String(idx);
      observer.observe(el);
    }
    return () => {
      observer.disconnect();
      rowObserverRef.current = null;
      if (measurementRafRef.current !== null) cancelAnimationFrame(measurementRafRef.current);
    };
  }, [useVirtualization]);

  const setRowRef = useCallback((el: HTMLDivElement | null, index: number) => {
    const obs = rowObserverRef.current;
    if (el) {
      el.dataset.rowIndex = String(index);
      rowRefsRef.current.set(index, el);
      obs?.observe(el);
    } else {
      const old = rowRefsRef.current.get(index);
      if (old) {
        obs?.unobserve(old);
        rowRefsRef.current.delete(index);
      }
    }
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [editText]);

  // Focus textarea when entering edit mode (avoids autoFocus a11y issue)
  useEffect(() => {
    if (editingId && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [editingId]);

  // Scroll to paragraph (called when user clicks search result row)
  const scrollToParagraph = useCallback(
    (id: string) => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const idx = paragraphs.findIndex((p) => p.id === id);
      if (idx < 0) return;

      if (useVirtualization) {
        const acc: number[] = [0];
        for (let i = 0; i < paragraphs.length; i++) {
          acc.push(acc[acc.length - 1] + getRowHeight(i));
        }
        const targetOffset = acc[idx];
        const scrollPadding = Math.max(0, containerHeight / 2 - EST_ROW_HEIGHT / 2);
        const top = Math.max(0, targetOffset - scrollPadding);
        container.scrollTo({ top, behavior: 'smooth' });
      } else {
        const rowEl = document.getElementById(`paragraph-row-${id}`);
        rowEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },
    [paragraphs, useVirtualization, getRowHeight, containerHeight]
  );

  useEffect(() => {
    if (!scrollToParagraphRef) return;
    scrollToParagraphRef.current = scrollToParagraph;
    return () => {
      scrollToParagraphRef.current = null;
    };
  }, [scrollToParagraphRef, scrollToParagraph]);

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

  // Calculate stats
  const originalChars = paragraphs.reduce((sum, p) => sum + p.originalText.length, 0);
  const translatedChars = paragraphs.reduce((sum, p) => sum + (p.translatedText?.length || 0), 0);

  const singleColumn = isOriginalReadingMode || isTranslationOnlyDisplay;

  return (
    <div class="text-panel-unified">
      <div class="panel-headers">
        {!isTranslationOnlyDisplay && (
          <div class="panel-header-left" style={singleColumn ? { width: '100%' } : {}}>
            🇬🇧 Оригинал (English)
            <span class="panel-stats">
              {originalChars.toLocaleString()} {t('paragraphList.characters')}
            </span>
          </div>
        )}
        {(isTranslationOnlyDisplay || !isOriginalReadingMode) && (
          <div
            class={`panel-header-right ${isTranslationOnlyDisplay ? 'panel-header-full' : ''}`}
            style={isTranslationOnlyDisplay ? { width: '100%' } : {}}
          >
            🇷🇺 Перевод (Русский)
            <span class="panel-stats">
              {translatedChars.toLocaleString()} {t('paragraphList.characters')}
            </span>
          </div>
        )}
      </div>

      <div class="paragraphs-unified" ref={scrollContainerRef} onScroll={handleScroll}>
        {useVirtualization && (
          <div style={{ height: totalHeight + 'px', position: 'relative' }}>
            <div
              style={{
                paddingTop: paddingTop + 'px',
                paddingBottom: Math.max(0, paddingBottom) + 'px',
              }}
            >
              {visibleParagraphs.map((paragraph, idx) => {
                const index = startIndex + idx;
                const isEmpty = emptyParagraphIds.includes(paragraph.id);
                const showCheckbox =
                  !isOriginalReadingMode &&
                  !isTranslationOnlyDisplay &&
                  isEmpty &&
                  onToggleParagraphSelection;
                const isSelected = selectedParagraphIds.includes(paragraph.id);
                const isSearchMatch = searchHighlight?.paragraphIds.includes(paragraph.id);
                const isSearchCurrent = searchHighlight?.currentParagraphId === paragraph.id;
                return (
                  <div
                    key={paragraph.id}
                    ref={(el) => setRowRef(el, index)}
                    id={`paragraph-row-${paragraph.id}`}
                    class={`paragraph-row ${highlightedId === paragraph.id ? 'highlighted' : ''} ${isSearchMatch ? 'search-match' : ''} ${isSearchCurrent ? 'search-current' : ''} ${isTranslationOnlyDisplay ? 'paragraph-row-translation-only' : ''}`}
                    style={{
                      ...(singleColumn ? { gridTemplateColumns: '1fr' } : {}),
                      minHeight: EST_ROW_HEIGHT + 'px',
                    }}
                    onMouseEnter={() => setHighlightedId(paragraph.id)}
                    onMouseLeave={() => setHighlightedId(null)}
                  >
                    {/* Original - hidden in original reading mode and translation-only display */}
                    {!isTranslationOnlyDisplay && (
                      <div
                        class="paragraph-cell paragraph-cell-original"
                        style={singleColumn ? { width: '100%' } : {}}
                      >
                        {showCheckbox && (
                          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- label wraps checkbox; onClick only stops propagation
                          <label
                            htmlFor={`para-select-${paragraph.id}`}
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
                              id={`para-select-${paragraph.id}`}
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => onToggleParagraphSelection?.(paragraph.id)}
                              style={{ accentColor: 'var(--accent)' }}
                              aria-label={t('paragraphList.selectParagraph', { index: index + 1 })}
                            />
                          </label>
                        )}
                        <span class="paragraph-index">{index + 1}</span>
                        <div class="paragraph-text">{paragraph.originalText}</div>
                      </div>
                    )}

                    {/* Translation - hidden only in original reading mode */}
                    {(!isOriginalReadingMode || isTranslationOnlyDisplay) && (
                      <div
                        class="paragraph-cell paragraph-cell-translation"
                        style={isTranslationOnlyDisplay ? { width: '100%' } : {}}
                      >
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
                                {saving ? (
                                  <span class="spinner" />
                                ) : (
                                  <>
                                    <Icon name="save" size="sm" /> {t('paragraphList.save')}
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            role="button"
                            tabIndex={0}
                            class={`paragraph-text editable ${!paragraph.translatedText ? 'empty' : ''}`}
                            onClick={() => startEditing(paragraph)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                startEditing(paragraph);
                              }
                            }}
                            dangerouslySetInnerHTML={{
                              __html: paragraph.translatedText
                                ? renderTextWithBlocks(paragraph.translatedText, textBlockTypes)
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
        )}
        {!useVirtualization &&
          paragraphs.map((paragraph, index) => {
            const isEmpty = emptyParagraphIds.includes(paragraph.id);
            const showCheckbox =
              !isOriginalReadingMode &&
              !isTranslationOnlyDisplay &&
              isEmpty &&
              onToggleParagraphSelection;
            const isSelected = selectedParagraphIds.includes(paragraph.id);
            const isSearchMatch = searchHighlight?.paragraphIds.includes(paragraph.id);
            const isSearchCurrent = searchHighlight?.currentParagraphId === paragraph.id;
            return (
              <div
                key={paragraph.id}
                id={`paragraph-row-${paragraph.id}`}
                class={`paragraph-row ${highlightedId === paragraph.id ? 'highlighted' : ''} ${isSearchMatch ? 'search-match' : ''} ${isSearchCurrent ? 'search-current' : ''} ${isTranslationOnlyDisplay ? 'paragraph-row-translation-only' : ''}`}
                style={singleColumn ? { gridTemplateColumns: '1fr' } : {}}
                onMouseEnter={() => setHighlightedId(paragraph.id)}
                onMouseLeave={() => setHighlightedId(null)}
              >
                {!isTranslationOnlyDisplay && (
                  <div
                    class="paragraph-cell paragraph-cell-original"
                    style={singleColumn ? { width: '100%' } : {}}
                  >
                    {showCheckbox && (
                      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- label wraps checkbox; onClick only stops propagation
                      <label
                        htmlFor={`para-select-${paragraph.id}`}
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
                          id={`para-select-${paragraph.id}`}
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleParagraphSelection?.(paragraph.id)}
                          style={{ accentColor: 'var(--accent)' }}
                          aria-label={t('paragraphList.selectParagraph', { index: index + 1 })}
                        />
                      </label>
                    )}
                    <span class="paragraph-index">{index + 1}</span>
                    <div class="paragraph-text">{paragraph.originalText}</div>
                  </div>
                )}
                {(!isOriginalReadingMode || isTranslationOnlyDisplay) && (
                  <div
                    class="paragraph-cell paragraph-cell-translation"
                    style={isTranslationOnlyDisplay ? { width: '100%' } : {}}
                  >
                    {isTranslationOnlyDisplay && <span class="paragraph-index">{index + 1}</span>}
                    {editingId === paragraph.id ? (
                      <div>
                        <textarea
                          ref={textareaRef}
                          class="paragraph-editor"
                          value={editText}
                          onInput={(e) => setEditText((e.target as HTMLTextAreaElement).value)}
                          onKeyDown={handleKeyDown}
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
                            {saving ? (
                              <span class="spinner" />
                            ) : (
                              <>
                                <Icon name="save" size="sm" /> {t('paragraphList.save')}
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        role="button"
                        tabIndex={0}
                        class={`paragraph-text editable ${!paragraph.translatedText ? 'empty' : ''}`}
                        onClick={() => startEditing(paragraph)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            startEditing(paragraph);
                          }
                        }}
                        dangerouslySetInnerHTML={{
                          __html: paragraph.translatedText
                            ? renderTextWithBlocks(paragraph.translatedText, textBlockTypes)
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
