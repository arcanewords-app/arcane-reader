import { useState, useMemo, useRef, useEffect } from 'preact/hooks';
// dnd-kit imports for modern drag & drop
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { useTranslation } from 'react-i18next';
import type { Chapter, ChapterStatus, Project } from '../../types';
import { Card, CountBadge, Modal } from '../ui';
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
  const [isDragging, setIsDragging] = useState(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [undoAvailable, setUndoAvailable] = useState(false);
  // optimistic local order for smoother UX during/after drag
  const [optimisticOrder, setOptimisticOrder] = useState<string[] | null>(null);
  const lastOrderRef = useRef<string[] | null>(null);
  const undoTimeoutRef = useRef<number | null>(null);
  const pointerYRef = useRef<number | null>(null);
  const DRAG_BUFFER = 20; // number of items buffer to render around pointer during drag
  const { t } = useTranslation();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<{
    title: string;
    message: string;
    details?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const numberInputRef = useRef<HTMLInputElement>(null);
  // Queue for sequential uploads
  type QueueItem = {
    id: string;
    file: File;
    title: string;
    status: 'pending' | 'uploading' | 'success' | 'error' | 'canceled';
    error?: string;
    warnings?: string[];
    result?: any;
    retries: number;
  };

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const processingRef = useRef(false);
  const queueRef = useRef<QueueItem[]>([]);
  const currentAbortRef = useRef<AbortController | null>(null);
  const removalTimeoutsRef = useRef<Record<string, number>>({});

  // schedule removal of a queue item after delay (ms)
  const scheduleRemove = (id: string, delay = 3000) => {
    // clear existing
    const existing = removalTimeoutsRef.current[id];
    if (existing) {
      clearTimeout(existing);
    }
    const tid = window.setTimeout(() => {
      setQueue((prev) => {
        const next = (prev.filter((it) => it.id !== id) as QueueItem[]);
        queueRef.current = next;
        return next;
      });
      delete removalTimeoutsRef.current[id];
    }, delay);
    removalTimeoutsRef.current[id] = tid;
  };

  const clearRemovalTimeout = (id: string) => {
    const existing = removalTimeoutsRef.current[id];
    if (existing) {
      clearTimeout(existing);
      delete removalTimeoutsRef.current[id];
    }
  };

  // cleanup removal timers on unmount
  useEffect(() => {
    return () => {
      Object.values(removalTimeoutsRef.current).forEach((tid) => clearTimeout(tid));
      removalTimeoutsRef.current = {};
    };
  }, []);

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // match server limit

  const generateId = () => `${Date.now().toString(36)}-${Math.round(Math.random() * 1e9)}`;

  // Virtualization state for large chapter lists
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const [containerHeight, setContainerHeight] = useState(400);
  const [scrollTop, setScrollTop] = useState(0);
  const ITEM_HEIGHT = 56; // px - approximate height per chapter row
  const BUFFER = 6; // render extra items above/below
  const prevChaptersCountRef = useRef(chapters.length);

  // sensors for dnd-kit
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // helper to get current ordered ids (prefer optimistic if set)
  const currentOrderedIds = () => {
    if (optimisticOrder && optimisticOrder.length === chapters.length) return optimisticOrder;
    return [...sortedChapters].map((c) => c.id);
  };

  // Sortable item: drag only from the handle, so delete/other buttons stay clickable
  const SortableItem = (props: any) => {
    const { id, children } = props;
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
    const style: any = {
      transform: transform ? CSS.Transform.toString(transform) : undefined,
      transition,
    };
    return (
      <div ref={setNodeRef} style={style}>
        {typeof children === 'function' ? children({ attributes, listeners }) : children}
      </div>
    );
  };

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

  const addFiles = (fileList: FileList | File[]) => {
    if (!projectId) {
      setError({ title: t('chapterList.uploadError'), message: 'No project selected' });
      return;
    }

    const supportedFormats = ['.txt', '.epub', '.fb2'];
    const newItems: QueueItem[] = Array.from(fileList).map((file) => {
      const filename = file.name.toLowerCase();
      const title = filename.endsWith('.txt')
        ? file.name.replace('.txt', '').replace(/^\d+[._\-\s]*/, '')
        : t('chapterList.defaultChapterTitle', { number: chapters.length + 1 });

      return {
        id: generateId(),
        file,
        title: title || t('chapterList.defaultChapterTitle', { number: chapters.length + 1 }),
        status: supportedFormats.some((ext) => filename.endsWith(ext)) ? 'pending' : 'error',
        error: supportedFormats.some((ext) => filename.endsWith(ext)) ? undefined : `${t('chapterList.unsupportedFormat')}: ${file.name}`,
        warnings: [],
        retries: 0,
      };
    });

    // Validate sizes and mark too-large files as error immediately
    newItems.forEach((it) => {
      if (it.file.size > MAX_FILE_SIZE) {
        it.status = 'error';
        it.error = `${t('chapterList.uploadError')}: ${t('chapterList.fileTooLarge') || 'File too large'}`;
      }
    });

    setQueue((q) => {
      const next = ([...q, ...newItems] as QueueItem[]);
      queueRef.current = next;
      return next;
    });
    // Start processing if not already
    setTimeout(() => startProcessing(), 0);
  };

  const handleFileSelect = (file: File) => addFiles([file]);

  const handleFileDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragover(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      addFiles(files);
    }
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
    const files = input.files;
    if (files && files.length > 0) {
      addFiles(files);
    }
    input.value = ''; // Reset for same file
  };

  const startProcessing = async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    setUploading(true);

    try {
      while (true) {
          // Find next pending item (use ref to avoid stale closure)
          const current = queueRef.current.find((it) => it.status === 'pending');
        if (!current) break;

        // mark uploading
        setQueue((prev) => {
          const next = (prev.map((it) => (it.id === current.id ? { ...it, status: 'uploading' } : it)) as QueueItem[]);
          queueRef.current = next;
          return next;
        });

        const controller = new AbortController();
        currentAbortRef.current = controller;

        try {
          const result = await api.uploadChapter(projectId as string, current.file, current.title, controller.signal);

          setQueue((prev) => {
            const next = (prev.map((it) => (it.id === current.id ? { ...it, status: 'success', result } : it)) as QueueItem[]);
            queueRef.current = next;
            return next;
          });
          // Auto-remove successful item after a short delay
          scheduleRemove(current.id, 3000);

          // Refresh chapters after each successful upload if callback provided
          if (onChaptersUpdate) {
            try {
              await onChaptersUpdate();
            } catch (err) {
              // ignore refresh errors here
              console.warn('Refresh after upload failed', err);
            }
          }
        } catch (err: any) {
          // If aborted, mark canceled
          if (err.name === 'AbortError') {
            setQueue((prev) => {
              const next = (prev.map((it) => (it.id === current.id ? { ...it, status: 'canceled', error: 'Canceled' } : it)) as QueueItem[]);
              queueRef.current = next;
              return next;
            });
            // schedule removal for canceled item
            scheduleRemove(current.id, 3000);
            break; // stop processing further
          }

          const errorMessage = err?.message || t('errors.unknown');
          const errorDetails = err?.data?.details || err?.data?.parseErrors?.join('; ') || err?.data?.error;
          const parseErrors = err?.data?.parseErrors;
          const warnings = err?.data?.warnings;

          let detailsText = `${t('chapterList.selectedFile') || 'File'}: ${current.file.name}`;
          if (errorDetails) detailsText += `\n\n${errorDetails}`;
          if (parseErrors && parseErrors.length > 0) detailsText += `\n\nОшибки парсинга:\n${parseErrors.map((e: string, i: number) => `${i + 1}. ${e}`).join('\n')}`;

          setQueue((prev) => {
            const next = (prev.map((it) => (it.id === current.id ? { ...it, status: 'error', error: detailsText, warnings } : it)) as QueueItem[]);
            queueRef.current = next;
            return next;
          });
          // leave error items for user to inspect / retry (do not auto-remove)
        } finally {
          currentAbortRef.current = null;
        }
      }
    } finally {
      processingRef.current = false;
      setProcessing(false);
      setUploading(false);
    }
  };

  const cancelQueue = () => {
    // Abort current upload and mark remaining pending as canceled
    if (currentAbortRef.current) {
      currentAbortRef.current.abort();
    }
    // Determine pending ids first
    const pendingIds = queueRef.current.filter((it) => it.status === 'pending').map((it) => it.id);
    setQueue((prev) => {
      const next = (prev.map((it) => (it.status === 'pending' ? { ...it, status: 'canceled' } : it)) as QueueItem[]);
      queueRef.current = next;
      return next;
    });
    // schedule removal for those canceled items
    pendingIds.forEach((id) => scheduleRemove(id, 3000));
  };

  const retryItem = (id: string) => {
    clearRemovalTimeout(id);
    setQueue((prev) => {
      const next = (prev.map((it) => (it.id === id ? { ...it, status: 'pending', error: undefined, retries: it.retries + 1 } : it)) as QueueItem[]);
      queueRef.current = next;
      return next;
    });
    setTimeout(() => startProcessing(), 0);
  };

  const removeItem = (id: string) => {
    clearRemovalTimeout(id);
    setQueue((prev) => {
      const next = (prev.filter((it) => it.id !== id) as QueueItem[]);
      queueRef.current = next;
      return next;
    });
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

    // Build new ordered array based on the new number for this chapter
    const sorted = [...chapters].sort((a, b) => a.number - b.number);
    const chapterToMove = sorted.find((c) => c.id === chapterId);
    if (!chapterToMove) {
      setEditingNumber(null);
      return;
    }
    
    // Remove the chapter from current position
    const without = sorted.filter((c) => c.id !== chapterId);
    
    // Insert at the new number position (0-based index: newNumber - 1)
    const insertIndex = newNumber - 1;
    const reordered = [...without];
    reordered.splice(insertIndex, 0, chapterToMove);
    const newIds = reordered.map((c) => c.id);

    setSavingNumber(true);
    setIsSavingOrder(true);
    setIsReverting(false);
    setOptimisticOrder(newIds);
    
    // Store previous order for undo
    const oldIds = sorted.map((c) => c.id);
    lastOrderRef.current = oldIds;
    setUndoAvailable(true);

    try {
      // API returns updated Project with reordered chapters
      const updatedProject = await api.reorderChapters(projectId, newIds);
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
      
      // saving finished, allow undo for a short window
      setIsSavingOrder(false);
      // clear any existing timeout
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current as number);
        undoTimeoutRef.current = null;
      }
      // allow user to undo within 8s after save
      undoTimeoutRef.current = window.setTimeout(() => {
        lastOrderRef.current = null;
        undoTimeoutRef.current = null;
        setUndoAvailable(false);
      }, 8000);
    } catch (error) {
      console.error('Failed to update chapter number:', error);
      // rollback optimistic order
      setOptimisticOrder(null);
      lastOrderRef.current = null;
      setUndoAvailable(false);
      setIsSavingOrder(false);
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current as number);
        undoTimeoutRef.current = null;
      }
      alert(error instanceof Error ? error.message : t('chapterList.errorUpdateNumber'));
      setEditedNumber(chapter.number);
    } finally {
      setSavingNumber(false);
      setIsSavingOrder(false);
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
  // detect container size and attach scroll handler
  useEffect(() => {
    const el = listContainerRef.current;
    if (!el) return;
    const onResize = () => setContainerHeight(el.clientHeight || 400);
    onResize();
    const obs = new ResizeObserver(onResize);
    obs.observe(el);
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener('scroll', onScroll);
    return () => {
      obs.disconnect();
      el.removeEventListener('scroll', onScroll);
    };
  }, []);

  // If chapters count grew, scroll to bottom so newly added chapters are visible
  useEffect(() => {
    const prev = prevChaptersCountRef.current;
    if (chapters.length > prev) {
      // scroll to bottom of list container
      const el = listContainerRef.current;
      if (el) {
        // small timeout to wait for DOM update
        setTimeout(() => {
          el.scrollTop = el.scrollHeight;
        }, 50);
      }
    }
    prevChaptersCountRef.current = chapters.length;
  }, [chapters.length]);

  // dnd-kit drag start handler
  const handleDndStart = (event: DragStartEvent) => {
    const activeId = event.active?.id as string | undefined;
    // starting a new drag clears previous undo (we don't keep multiple undo slots)
    clearUndoImmediate();
    setIsDragging(true);
    // reset optimistic order until drop
    setOptimisticOrder(null);
    // attach pointermove listener to ensure item under pointer is rendered
    window.addEventListener('pointermove', onPointerMove);
    // initialize pointerY
    pointerYRef.current = null;
  };

  // dnd-kit drag end handler (pointer-based insertion)
  const handleDndEnd = async (event: DragEndEvent) => {
    setIsDragging(false);
    const activeId = event.active?.id as string | undefined;
    const overId = event.over?.id as string | undefined;

  // remove pointer listener
  window.removeEventListener('pointermove', onPointerMove);

  if (!activeId || !projectId) return;
    if (!overId || activeId === overId) return;

    const ids = currentOrderedIds();
    const oldIndex = ids.indexOf(activeId);
    const newIndex = ids.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1) return;

    // optimistic reorder locally for immediate feedback
    const newIds = arrayMove(ids, oldIndex, newIndex);
    // store previous order for friendly undo
    const prevIds = ids.slice();
    lastOrderRef.current = prevIds;
    setUndoAvailable(true);
    setIsSavingOrder(true);
    setIsReverting(false);
    setOptimisticOrder(newIds);

    try {
      // Send full ordered ids to server for atomic reorder
      const updatedProject = await api.reorderChapters(projectId, newIds);
      // update global cache and parent state if provided
      const { updateProjectCache } = await import('../../store/projects');
      updateProjectCache(updatedProject);
      if (onProjectUpdate) {
        onProjectUpdate(updatedProject);
      } else if (onChaptersUpdate) {
        await onChaptersUpdate();
      }
      // saving finished, allow undo for a short window
      setIsSavingOrder(false);
      // clear any existing timeout
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current as number);
        undoTimeoutRef.current = null;
      }
      // allow user to undo within 8s after save
      undoTimeoutRef.current = window.setTimeout(() => {
        lastOrderRef.current = null;
        undoTimeoutRef.current = null;
        setUndoAvailable(false);
      }, 8000);
    } catch (err) {
      // rollback optimistic order and refresh from server
      setOptimisticOrder(null);
      lastOrderRef.current = null;
      setUndoAvailable(false);
      setIsSavingOrder(false);
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current as number);
        undoTimeoutRef.current = null;
      }
      if (onChaptersUpdate) await onChaptersUpdate();
      console.error('Failed to reorder chapter:', err);
      alert(err instanceof Error ? err.message : t('chapter.errorReorder'));
    }
  };

  const clearUndoImmediate = () => {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current as number);
      undoTimeoutRef.current = null;
    }
    lastOrderRef.current = null;
    setUndoAvailable(false);
    setIsSavingOrder(false);
    setIsReverting(false);
  };

  const handleUndo = async () => {
    if (!projectId || !lastOrderRef.current) return;
    const toRestore = lastOrderRef.current;
    // show revert indicator
    setIsReverting(true);
    setIsSavingOrder(true);
    // optimistically show restored order
    setOptimisticOrder(toRestore.slice());

    try {
      const updatedProject = await api.reorderChapters(projectId, toRestore);
      const { updateProjectCache } = await import('../../store/projects');
      updateProjectCache(updatedProject);
      if (onProjectUpdate) {
        onProjectUpdate(updatedProject);
      } else if (onChaptersUpdate) {
        await onChaptersUpdate();
      }
      // clear undo state
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current as number);
        undoTimeoutRef.current = null;
      }
      lastOrderRef.current = null;
      setUndoAvailable(false);
    } catch (err) {
      console.error('Failed to undo reorder:', err);
      alert(err instanceof Error ? err.message : t('chapter.errorReorder'));
      // refresh from server to ensure UI consistent
      if (onChaptersUpdate) await onChaptersUpdate();
    } finally {
      setIsReverting(false);
      setIsSavingOrder(false);
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    pointerYRef.current = e.clientY;
    // If dragging, ensure the item under pointer is rendered by scrolling container if needed
    if (!isDragging) return;
    const el = listContainerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const localY = e.clientY - rect.top + el.scrollTop; // position within scroll content
    const pointerIndex = Math.floor(localY / ITEM_HEIGHT);
    const visibleStart = Math.max(0, Math.floor(el.scrollTop / ITEM_HEIGHT) - BUFFER);
    const visibleEnd = Math.min(filteredChapters.length, Math.ceil((el.scrollTop + containerHeight) / ITEM_HEIGHT) + BUFFER);
    if (pointerIndex < visibleStart + 2 || pointerIndex > visibleEnd - 2) {
      // scroll so pointerIndex is centered
      const targetScroll = Math.max(0, pointerIndex * ITEM_HEIGHT - Math.floor(containerHeight / 2));
      el.scrollTop = targetScroll;
      // update scroll state
      setScrollTop(el.scrollTop);
    }
  };

  return (
    <Card
      title={(
        <>
          📖 {t('chapterList.title')} <CountBadge count={counts.all} />
          <span style={{ marginLeft: '0.5rem', display: 'inline-flex', alignItems: 'center' }}>
            {isSavingOrder && (
              <>
                <span class="spinner" style={{ marginRight: '0.4rem', width: '12px', height: '12px' }} />
                <small style={{ color: 'var(--text-dim)' }}>{t('chapterList.savingOrder') || 'Saving order...'}</small>
              </>
            )}
            {!isSavingOrder && undoAvailable && (
              <>
                <small style={{ color: 'var(--text-dim)', marginRight: '0.5rem' }}>{isReverting ? t('chapterList.reverting') || 'Reverting...' : t('chapterList.orderSaved') || 'Order saved'}</small>
                <button class="small" onClick={(e: any) => { e.stopPropagation(); handleUndo(); }} disabled={isReverting}>
                  {isReverting ? t('chapterList.reverting') || 'Reverting...' : t('chapterList.undo') || 'Undo'}
                </button>
              </>
            )}
          </span>
        </>
      )}
      className="chapter-list-card"
    >
      <div class="chapter-search">
        <input
          type="text"
          class="chapter-search-input"
          placeholder={`🔍 ${t('chapterList.searchPlaceholder')}`}
          value={search}
          onInput={(e: any) => setSearch((e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="chapter-filters">
        {(['all', ...(originalReadingMode ? [] : ['pending', 'completed', 'error'] as FilterType[])] as FilterType[]).map((f) => (
          <button
            key={f}
            class={`chapter-filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? t('chapterList.all') : f === 'pending' ? '⏳' : f === 'completed' ? '✅' : '❌'}
          </button>
        ))}
      </div>

      <DndContext sensors={sensors} onDragStart={handleDndStart} onDragEnd={handleDndEnd} collisionDetection={undefined} modifiers={[restrictToVerticalAxis]}>
        <div class="chapter-list" ref={listContainerRef}>
          {filteredChapters.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-dim)' }}>
              {chapters.length === 0 ? t('chapterList.noChapters') : t('chapterList.noResults')}
            </div>
          ) : (
            <SortableContext items={currentOrderedIds()} strategy={verticalListSortingStrategy}>
              {!isDragging && (
                // When NOT dragging, use virtualization for performance
                (() => {
                  const total = filteredChapters.length;
                  const totalHeight = total * ITEM_HEIGHT;
                  const start = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER);
                  const end = Math.min(total, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + BUFFER);
                  const slice = filteredChapters.slice(start, end);
                  const paddingTop = start * ITEM_HEIGHT;
                  const paddingBottom = Math.max(0, totalHeight - end * ITEM_HEIGHT);

                  return (
                    <div style={{ height: totalHeight + 'px', position: 'relative' }}>
                      <div style={{ paddingTop: paddingTop + 'px', paddingBottom: paddingBottom + 'px' }}>
                        {slice.map((chapter) => (
                          <SortableItem id={chapter.id} key={chapter.id}>
                            {({ attributes, listeners }) => (
                            <div
                              class={`chapter-item ${selectedId === chapter.id ? 'active' : ''}`}
                              onClick={() => onSelect(chapter.id)}
                              title={chapter.title}
                              style={{
                                height: ITEM_HEIGHT + 'px',
                                boxSizing: 'border-box',
                              }}
                            >
                              <div
                                class="chapter-item-drag-area"
                                {...attributes}
                                {...listeners}
                              >
                                {editingNumber === chapter.id ? (
                                <div class="chapter-number-edit" onClick={(e: any) => e.stopPropagation()} onPointerDown={(e: any) => e.stopPropagation()}>
                                  <input
                                    ref={editingNumber === chapter.id ? numberInputRef : undefined}
                                    type="number"
                                    min="1"
                                    max={chapters.length}
                                    value={editedNumber}
                                    onInput={(e: any) => {
                                      const value = parseInt((e.target as HTMLInputElement).value, 10);
                                      if (!isNaN(value)) {
                                        setEditedNumber(Math.max(1, Math.min(value, chapters.length)));
                                      }
                                    }}
                                    onKeyDown={(e: any) => handleNumberKeyDown(e, chapter.id)}
                                    onBlur={() => handleSaveNumber(chapter.id)}
                                    disabled={savingNumber}
                                    class="chapter-number-input"
                                    style={{ width: '3rem', textAlign: 'center' }}
                                  />
                                  <div class="chapter-number-edit-actions">
                                    <button
                                      class="chapter-number-save-btn"
                                      onClick={(e: any) => {
                                        e.stopPropagation();
                                        handleSaveNumber(chapter.id);
                                      }}
                                      disabled={savingNumber}
                                      title={t('chapterList.saveNumberTitle')}
                                    >
                                      ✓
                                    </button>
                                    <button
                                      class="chapter-number-cancel-btn"
                                      onClick={(e: any) => {
                                        e.stopPropagation();
                                        handleCancelEditNumber(chapter);
                                      }}
                                      disabled={savingNumber}
                                      title={t('chapterList.cancelNumberTitle')}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <span
                                  class="chapter-number"
                                  onClick={(e: any) => handleStartEditNumber(chapter, e)}
                                  title={t('chapterList.editNumberTitle')}
                                  style={{ cursor: 'pointer' }}
                                >
                                  {chapter.number}
                                </span>
                              )}
                                <span class="chapter-item-title">{chapter.title}</span>
                              </div>
                              <div
                                class="chapter-item-actions"
                                onClick={(e: any) => e.stopPropagation()}
                                onPointerDown={(e: any) => e.stopPropagation()}
                                role="group"
                                aria-label={t('chapterList.deleteTitle')}
                              >
                                {!originalReadingMode && (
                                  <span>{getStatusIcon(chapter.status)}</span>
                                )}
                                {onDelete && (
                                  <button
                                    type="button"
                                    class="chapter-delete-btn"
                                    onClick={(e: any) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      setDeleteConfirmId(chapter.id);
                                    }}
                                    onPointerDown={(e: any) => e.stopPropagation()}
                                    title={t('chapterList.deleteTitle')}
                                    disabled={deleting}
                                  >
                                    🗑️
                                  </button>
                                )}
                              </div>
                            </div>
                            )}
                          </SortableItem>
                        ))}
                      </div>
                    </div>
                  );
                })()
              )}
              {isDragging && (
                // When dragging, render full list without virtualization
                <div>
                  {filteredChapters.map((chapter) => (
                    <SortableItem id={chapter.id} key={chapter.id}>
                      {({ attributes, listeners }) => (
                        <div
                          class={`chapter-item ${selectedId === chapter.id ? 'active' : ''}`}
                          onClick={() => onSelect(chapter.id)}
                          title={chapter.title}
                          style={{
                            height: ITEM_HEIGHT + 'px',
                            boxSizing: 'border-box',
                          }}
                        >
                          <div
                            class="chapter-item-drag-area"
                            {...attributes}
                            {...listeners}
                            style={{ cursor: 'grabbing' }}
                          >
                            <span class="chapter-number">{chapter.number}</span>
                            <span class="chapter-item-title">{chapter.title}</span>
                          </div>
                          <div class="chapter-item-actions">
                            {!originalReadingMode && (
                              <span>{getStatusIcon(chapter.status)}</span>
                            )}
                          </div>
                        </div>
                      )}
                    </SortableItem>
                  ))}
                </div>
              )}
            </SortableContext>
          )}
        </div>
      </DndContext>

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
            <p dangerouslySetInnerHTML={{ __html: t('chapterList.dragFileOrClick') }} />
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.epub,.fb2"
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />
        <Modal
          isOpen={!!error}
          onClose={() => setError(null)}
          title={error?.title ?? ''}
          variant="error"
          overlayClassName="error-modal-overlay"
          className="error-modal"
          footer={
            <button onClick={() => setError(null)}>{t('common.close')}</button>
          }
        >
          {error && (
            <>
              <p>{error.message}</p>
              {error.details && <pre class="error-details">{error.details}</pre>}
            </>
          )}
        </Modal>

        <Modal
          isOpen={!!deleteConfirmId}
          onClose={() => setDeleteConfirmId(null)}
          title={t('chapter.deleteConfirmTitle')}
          variant="error"
          overlayClassName="error-modal-overlay"
          className="error-modal"
          closeButtonDisabled={deleting}
          footer={
            <>
              <button
                onClick={() => setDeleteConfirmId(null)}
                disabled={deleting}
                style={{ marginRight: '0.5rem' }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={async () => {
                  if (!onDelete || !deleteConfirmId) return;
                  setDeleting(true);
                  try {
                    await onDelete(deleteConfirmId);
                    setDeleteConfirmId(null);
                  } catch (err) {
                    console.error('Failed to delete chapter:', err);
                    setError({
                      title: t('chapter.errorDeleting'),
                      message: err instanceof Error ? err.message : t('chapter.errorDeleteFailed'),
                    });
                  } finally {
                    setDeleting(false);
                  }
                }}
                disabled={deleting}
                style={{
                  background: 'var(--error)',
                  color: 'white',
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? t('chapter.deleting') : t('common.delete')}
              </button>
            </>
          }
        >
          {deleteConfirmId && (
            <>
              <p>
                {t('chapter.deleteConfirmMessage', {
                  title: sortedChapters.find((c) => c.id === deleteConfirmId)?.title || t('chapter.unknownChapter'),
                })}
              </p>
              <p style={{ color: 'var(--error)', fontSize: '0.9rem', marginTop: '1rem' }}>
                ⚠️ {t('chapter.cannotUndo')}
              </p>
            </>
          )}
        </Modal>

        {queue.length > 0 && (
          <div class="upload-queue">
            <div class="upload-queue-header">
              <strong>{t('chapterList.uploadQueue') || 'Upload queue'}</strong>
              {processing && (
                <button class="upload-queue-cancel" onClick={() => cancelQueue()}>{t('chapterList.cancelQueue') || 'Cancel'}</button>
              )}
            </div>

            {queue.map((item) => (
              <div key={item.id} class={`queue-item ${item.status}`}>
                <div class="queue-item-left">
                  <span class={`queue-status ${item.status}`}>{item.status === 'uploading' ? '⏳' : item.status === 'success' ? '✅' : item.status === 'error' ? '❌' : item.status === 'canceled' ? '✖' : '●'}</span>
                  <span class="queue-name">{item.file.name}</span>
                </div>
                <div class="queue-item-actions">
                  {item.status === 'error' && (
                    <button class="small" onClick={() => retryItem(item.id)}>{t('common.retry') || 'Retry'}</button>
                  )}
                  {item.status === 'pending' && (
                    <button class="small" onClick={() => removeItem(item.id)}>{t('common.remove') || 'Remove'}</button>
                  )}
                </div>
                {item.error && <pre class="queue-error">{item.error}</pre>}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

