import type { ComponentChildren } from 'preact';
import { useState, useMemo, useRef, useEffect, useCallback } from 'preact/hooks';
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
import { useSystemStatus } from '../../contexts/SystemStatusContext';
import { chapterDisplayTitle, chapterMatchesListSearch } from '../../../shared/chapterTitle';
import type {
  Chapter,
  ChapterListItem,
  ChapterStatus,
  Project,
  ProjectWithChapterList,
} from '../../types';
import { Card, CountBadge, Modal, Button, Icon } from '../ui';
import { api } from '../../api/client';
import './ChapterList.css';

type FilterType = 'all' | ChapterStatus;

interface ChapterListProps {
  chapters: Chapter[] | ChapterListItem[];
  selectedId: string | null;
  projectId: string | null;
  originalReadingMode?: boolean;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  onUpload: (params: {
    file: File;
    title: string;
    signal?: AbortSignal;
    onProgress?: (loaded: number, total: number) => void;
  }) => Promise<Chapter | { chapters: Chapter[]; count: number; warnings?: string[] }>;
  onChaptersUpdate?: () => void | Promise<void>;
  onProjectUpdate?: (project: Project | ProjectWithChapterList) => void;
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
  const [reorderMode, setReorderMode] = useState(false);
  // optimistic local order for smoother UX during/after drag
  const [optimisticOrder, setOptimisticOrder] = useState<string[] | null>(null);
  const lastOrderRef = useRef<string[] | null>(null);
  const undoTimeoutRef = useRef<number | null>(null);
  const pointerYRef = useRef<number | null>(null);
  const DRAG_BUFFER = 20; // number of items buffer to render around pointer during drag
  const { t } = useTranslation();
  const systemStatus = useSystemStatus();
  const MAX_FILE_SIZE = systemStatus?.maxFileSizeBytes ?? 50 * 1024 * 1024; // fallback 50MB
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<{
    title: string;
    message: string;
    details?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const numberInputRef = useRef<HTMLInputElement>(null);
  // Queue for normalized uploads
  type QueueItem = {
    id: string;
    file: File;
    title: string;
    status: 'pending' | 'uploading' | 'success' | 'error' | 'canceled';
    error?: string;
    warnings?: string[];
    result?: unknown;
    retries: number;
    /** Byte-level progress when status is 'uploading' */
    uploadProgress?: { loaded: number; total: number };
    /** Phase: sending bytes vs server processing (when loaded===total) */
    uploadPhase?: 'sending' | 'processing';
    importJobId?: string;
    importPhase?: string;
    importCurrent?: number;
    importTotal?: number;
    importCurrentChapterTitle?: string;
  };

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const processingRef = useRef(false);
  const queueRef = useRef<QueueItem[]>([]);
  const currentAbortRef = useRef<AbortController | null>(null);
  const activeAbortRef = useRef<Map<string, AbortController>>(new Map());
  const removalTimeoutsRef = useRef<Record<string, number>>({});
  const PARALLEL_LIMIT = 3;
  const IMPORT_POLL_INTERVAL_MIN_MS = 1500;
  const IMPORT_POLL_INTERVAL_MAX_MS = 8000;
  const IMPORT_POLL_BACKOFF_FACTOR = 1.5;

  // schedule removal of a queue item after delay (ms)
  const scheduleRemove = (id: string, delay = 3000) => {
    // clear existing
    const existing = removalTimeoutsRef.current[id];
    if (existing) {
      clearTimeout(existing);
    }
    const tid = window.setTimeout(() => {
      setQueue((prev) => {
        const next = prev.filter((it) => it.id !== id) as QueueItem[];
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

  const generateId = () => `${Date.now().toString(36)}-${Math.round(Math.random() * 1e9)}`;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const isJobBasedFormat = (name: string) => {
    const lower = name.toLowerCase();
    return lower.endsWith('.epub') || lower.endsWith('.fb2') || lower.endsWith('.csv');
  };
  const refreshChaptersSafely = async (reason: string) => {
    if (!onChaptersUpdate) return;
    try {
      await onChaptersUpdate();
    } catch (err) {
      console.warn(`Refresh after ${reason} failed`, err);
    }
  };

  // Virtualization state for large chapter lists
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const [containerHeight, setContainerHeight] = useState(400);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollTopRafRef = useRef<number | null>(null); // throttle scroll updates
  const edgeScrollRafRef = useRef<number | null>(null); // edge auto-scroll animation
  const ITEM_HEIGHT = 56; // px - approximate height per chapter row
  const BUFFER = 6; // render extra items above/below
  const prevChaptersCountRef = useRef(chapters.length);

  // Edge scroll zone: distance from top/bottom (px) where auto-scroll activates
  const EDGE_SCROLL_ZONE = 80;
  const EDGE_SCROLL_SPEED_MAX = 12; // px per frame

  // sensors for dnd-kit
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // helper to get current ordered ids (prefer optimistic if set)
  const currentOrderedIds = () => {
    if (optimisticOrder && optimisticOrder.length === chapters.length) return optimisticOrder;
    return [...sortedChapters].map((c) => c.id);
  };

  // Sortable item: drag only from the handle, so delete/other buttons stay clickable
  const SortableItem = (props: {
    id: string;
    children:
      | ComponentChildren
      | ((x: {
          attributes: Record<string, unknown>;
          listeners: Record<string, unknown>;
        }) => ComponentChildren);
  }) => {
    const { id, children } = props;
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
      id,
      disabled: !reorderMode,
    });
    const style: { transform?: string; transition?: string } = {
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
      const matchesSearch = chapterMatchesListSearch(ch, search);
      return matchesFilter && matchesSearch;
    });
  }, [sortedChapters, filter, search]);

  const counts = useMemo(
    () => ({
      all: chapters.length,
      pending: originalReadingMode ? 0 : chapters.filter((c) => c.status === 'pending').length,
      completed: originalReadingMode ? 0 : chapters.filter((c) => c.status === 'completed').length,
      partial: originalReadingMode ? 0 : chapters.filter((c) => c.status === 'partial').length,
      draft: originalReadingMode ? 0 : chapters.filter((c) => c.status === 'draft').length,
      analyzed: originalReadingMode ? 0 : chapters.filter((c) => c.status === 'analyzed').length,
      error: originalReadingMode ? 0 : chapters.filter((c) => c.status === 'error').length,
    }),
    [chapters, originalReadingMode]
  );

  const addFiles = (fileList: FileList | File[]) => {
    if (!projectId) {
      setError({ title: t('chapterList.uploadError'), message: 'No project selected' });
      return;
    }

    const supportedFormats = ['.txt', '.epub', '.fb2', '.csv'];
    const normalizeTitle = (file: File, index: number): string => {
      const noExt = file.name.replace(/\.[^.]+$/, '');
      const cleaned = noExt.replace(/^\d+[._\-\s]*/, '').trim();
      return (
        cleaned || t('chapterList.defaultChapterTitle', { number: chapters.length + index + 1 })
      );
    };
    const newItems: QueueItem[] = Array.from(fileList).map((file, index) => {
      const filename = file.name.toLowerCase();
      const supported = supportedFormats.some((ext) => filename.endsWith(ext));
      return {
        id: generateId(),
        file,
        title: normalizeTitle(file, index),
        status: supported ? 'pending' : 'error',
        error: supported ? undefined : `${t('chapterList.unsupportedFormat')}: ${file.name}`,
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
      const next = [...q, ...newItems] as QueueItem[];
      queueRef.current = next;
      return next;
    });
    setShowUploadModal(true);
    // Start processing if not already
    setTimeout(() => startProcessing(), 0);
  };

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

  const processOneItem = async (current: QueueItem): Promise<boolean> => {
    const controller = new AbortController();
    activeAbortRef.current.set(current.id, controller);
    currentAbortRef.current = controller;

    setQueue((prev) => {
      const next = prev.map((it) =>
        it.id === current.id
          ? { ...it, status: 'uploading', uploadProgress: undefined, uploadPhase: 'sending' }
          : it
      ) as QueueItem[];
      queueRef.current = next;
      return next;
    });

    const onProgress = (loaded: number, total: number) => {
      const phase = total > 0 && loaded >= total ? 'processing' : 'sending';
      setQueue((prev) => {
        const next = prev.map((it) =>
          it.id === current.id
            ? { ...it, uploadProgress: { loaded, total }, uploadPhase: phase }
            : it
        ) as QueueItem[];
        queueRef.current = next;
        return next;
      });
    };

    const itemLabel = `${t('chapterList.selectedFile') || 'File'}: ${current.file.name}`;

    try {
      if (isJobBasedFormat(current.file.name)) {
        const job = await api.startImportJob(
          projectId as string,
          current.file,
          current.title,
          controller.signal,
          onProgress
        );
        setQueue((prev) => {
          const next = prev.map((it) =>
            it.id === current.id ? { ...it, importJobId: job.jobId, uploadPhase: 'processing' } : it
          ) as QueueItem[];
          queueRef.current = next;
          return next;
        });

        // Poll job status until terminal state (adaptive interval to reduce API/Redis load)
        const MAX_IMPORT_POLL_ATTEMPTS = 120;
        let pollDelayMs = IMPORT_POLL_INTERVAL_MIN_MS;
        let previousSnapshot = '';
        let importPollAttempt = 0;

        while (true) {
          importPollAttempt++;
          if (importPollAttempt > MAX_IMPORT_POLL_ATTEMPTS) {
            const msg = t('chapterList.importJobLost');
            setQueue((prev) => {
              const next = prev.map((it) =>
                it.id === current.id ? { ...it, status: 'error' as const, error: msg } : it
              ) as QueueItem[];
              queueRef.current = next;
              return next;
            });
            await refreshChaptersSafely('import timeout');
            return false;
          }
          let state;
          try {
            state = await api.getImportJob(projectId as string, job.jobId, controller.signal);
          } catch (_jobErr) {
            const msg = t('chapterList.importJobLost');
            setQueue((prev) => {
              const next = prev.map((it) =>
                it.id === current.id ? { ...it, status: 'error' as const, error: msg } : it
              ) as QueueItem[];
              queueRef.current = next;
              return next;
            });
            await refreshChaptersSafely('import error');
            return false;
          }
          const currentSnapshot = `${state.status}|${state.phase}|${state.current}|${state.total}|${state.currentChapterTitle ?? ''}`;
          const hasStateChanged = currentSnapshot !== previousSnapshot;
          previousSnapshot = currentSnapshot;

          setQueue((prev) => {
            const next = prev.map((it) =>
              it.id === current.id
                ? {
                    ...it,
                    uploadPhase: state.status === 'processing' ? 'processing' : it.uploadPhase,
                    importPhase: state.phase ?? undefined,
                    importCurrent: state.current,
                    importTotal: state.total,
                    importCurrentChapterTitle: state.currentChapterTitle,
                  }
                : it
            ) as QueueItem[];
            queueRef.current = next;
            return next;
          });

          if (state.status === 'completed') {
            setQueue((prev) => {
              const next = prev.map((it) =>
                it.id === current.id
                  ? { ...it, status: 'success', result: state, warnings: state.warnings }
                  : it
              ) as QueueItem[];
              queueRef.current = next;
              return next;
            });
            scheduleRemove(current.id, 3000);
            await refreshChaptersSafely('upload');
            return true;
          }

          if (state.status === 'error') {
            const details = state.errors?.join('\n') || 'Import job failed';
            setQueue((prev) => {
              const next = prev.map((it) =>
                it.id === current.id
                  ? {
                      ...it,
                      status: 'error',
                      error: `${itemLabel}\n\n${details}`,
                      warnings: state.warnings,
                    }
                  : it
              ) as QueueItem[];
              queueRef.current = next;
              return next;
            });
            await refreshChaptersSafely('import error');
            return true;
          }

          if (state.status === 'canceled') {
            setQueue((prev) => {
              const next = prev.map((it) =>
                it.id === current.id ? { ...it, status: 'canceled', error: 'Canceled' } : it
              ) as QueueItem[];
              queueRef.current = next;
              return next;
            });
            scheduleRemove(current.id, 3000);
            await refreshChaptersSafely('import cancel');
            return false;
          }

          if (hasStateChanged) {
            pollDelayMs = IMPORT_POLL_INTERVAL_MIN_MS;
          } else {
            pollDelayMs = Math.min(
              IMPORT_POLL_INTERVAL_MAX_MS,
              Math.round(pollDelayMs * IMPORT_POLL_BACKOFF_FACTOR)
            );
          }

          await sleep(pollDelayMs);
        }
      }

      const result = await onUpload({
        file: current.file,
        title: current.title,
        signal: controller.signal,
        onProgress,
      });

      const resultWarnings =
        result && typeof result === 'object' && 'warnings' in result
          ? (result as { warnings?: string[] }).warnings
          : undefined;

      setQueue((prev) => {
        const next = prev.map((it) =>
          it.id === current.id ? { ...it, status: 'success', result, warnings: resultWarnings } : it
        ) as QueueItem[];
        queueRef.current = next;
        return next;
      });
      scheduleRemove(current.id, 3000);

      await refreshChaptersSafely('upload');
      return true;
    } catch (err: unknown) {
      const errObj = err as {
        name?: string;
        message?: string;
        data?: {
          details?: string;
          parseErrors?: string[];
          error?: string;
          warnings?: string[];
        };
      };
      if (errObj.name === 'AbortError' || errObj.message === 'Request aborted') {
        setQueue((prev) => {
          const next = prev.map((it) =>
            it.id === current.id ? { ...it, status: 'canceled', error: 'Canceled' } : it
          ) as QueueItem[];
          queueRef.current = next;
          return next;
        });
        scheduleRemove(current.id, 3000);
        await refreshChaptersSafely('abort');
        return false;
      }

      const errorDetails =
        errObj.data?.details || errObj.data?.parseErrors?.join('; ') || errObj.data?.error;
      const parseErrors = errObj.data?.parseErrors;
      const warnings = errObj.data?.warnings;

      let detailsText = itemLabel;
      if (errObj.message) detailsText += `\n\n${errObj.message}`;
      if (errorDetails) detailsText += `\n\n${errorDetails}`;
      if (parseErrors && parseErrors.length > 0)
        detailsText += `\n\nОшибки парсинга:\n${parseErrors.map((e: string, i: number) => `${i + 1}. ${e}`).join('\n')}`;

      setQueue((prev) => {
        const next = prev.map((it) =>
          it.id === current.id ? { ...it, status: 'error', error: detailsText, warnings } : it
        ) as QueueItem[];
        queueRef.current = next;
        return next;
      });
      return true;
    } finally {
      activeAbortRef.current.delete(current.id);
      if (currentAbortRef.current === controller) {
        currentAbortRef.current = null;
      }
    }
  };

  const startProcessing = async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    setUploading(true);

    try {
      const inFlight: Promise<boolean>[] = [];

      const maybeStartNext = () => {
        const pending = queueRef.current.filter((it) => it.status === 'pending');
        if (pending.length === 0 && inFlight.length === 0) return;
        while (inFlight.length < PARALLEL_LIMIT) {
          const next = queueRef.current.find((it) => it.status === 'pending');
          if (!next) break;
          const p = processOneItem(next).then((continueProcessing) => {
            inFlight.splice(inFlight.indexOf(p), 1);
            if (!continueProcessing) return;
            maybeStartNext();
          });
          inFlight.push(p);
        }
      };

      maybeStartNext();

      while (inFlight.length > 0) {
        await Promise.race(inFlight);
      }
    } finally {
      processingRef.current = false;
      setProcessing(false);
      setUploading(false);
    }
  };

  const cancelQueue = () => {
    // Abort all active uploads and mark remaining pending as canceled
    activeAbortRef.current.forEach((c) => c.abort());
    activeAbortRef.current.clear();
    if (currentAbortRef.current) {
      currentAbortRef.current.abort();
    }
    // Determine pending ids first
    const pendingIds = queueRef.current.filter((it) => it.status === 'pending').map((it) => it.id);
    setQueue((prev) => {
      const next = prev.map((it) =>
        it.status === 'pending' ? { ...it, status: 'canceled' } : it
      ) as QueueItem[];
      queueRef.current = next;
      return next;
    });
    // Request server-side cancel for active import jobs
    if (projectId) {
      queueRef.current
        .filter((it) => it.status === 'uploading' && it.importJobId)
        .forEach((it) => {
          void api.cancelImportJob(projectId, it.importJobId as string).catch(() => {});
        });
      // Some chapters may still be committed right after abort; refresh shortly after cancel.
      if (onChaptersUpdate) {
        setTimeout(() => {
          void refreshChaptersSafely('cancel queue');
        }, 1200);
      }
    }
    // schedule removal for those canceled items
    pendingIds.forEach((id) => scheduleRemove(id, 3000));
  };

  const retryItem = (id: string) => {
    clearRemovalTimeout(id);
    setQueue((prev) => {
      const next = prev.map((it) =>
        it.id === id ? { ...it, status: 'pending', error: undefined, retries: it.retries + 1 } : it
      ) as QueueItem[];
      queueRef.current = next;
      return next;
    });
    setTimeout(() => startProcessing(), 0);
  };

  const removeItem = (id: string) => {
    clearRemovalTimeout(id);
    setQueue((prev) => {
      const next = prev.filter((it) => it.id !== id) as QueueItem[];
      queueRef.current = next;
      return next;
    });
  };

  const getStatusIcon = (status: ChapterStatus) => {
    switch (status) {
      case 'completed':
        return <Icon name="check_circle" size="sm" />;
      case 'partial':
        return <Icon name="warning" size="sm" />;
      case 'draft':
        return <Icon name="edit_note" size="sm" />;
      case 'translating':
        return <Icon name="translate" size="sm" />;
      case 'analyzed':
        return <Icon name="manage_search" size="sm" />;
      case 'error':
        return <Icon name="error" size="sm" />;
      default:
        return <Icon name="schedule" size="sm" />;
    }
  };

  const handleStartEditNumber = (chapter: Chapter, e: MouseEvent) => {
    e.stopPropagation();
    if (!reorderMode || !projectId) return;
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

    const chapter = chapters.find((c) => c.id === chapterId);
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
      setError({
        title: t('chapterList.errorUpdateNumber'),
        message: error instanceof Error ? error.message : t('chapterList.errorUpdateNumber'),
      });
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

  const exitReorderMode = useCallback(() => {
    if (editingNumber) {
      const chapter = chapters.find((c) => c.id === editingNumber);
      if (chapter) handleCancelEditNumber(chapter);
    }
    setReorderMode(false);
  }, [chapters, editingNumber]);

  const enterReorderMode = useCallback(() => {
    setFilter('all');
    setSearch('');
    setReorderMode(true);
  }, []);

  const toggleReorderMode = useCallback(() => {
    if (reorderMode) {
      if (isDragging) return;
      exitReorderMode();
    } else {
      enterReorderMode();
    }
  }, [reorderMode, isDragging, exitReorderMode, enterReorderMode]);

  useEffect(() => {
    setReorderMode(false);
    setEditingNumber(null);
  }, [projectId]);

  const handleNumberKeyDown = (e: KeyboardEvent, chapterId: string) => {
    if (e.key === 'Enter') {
      handleSaveNumber(chapterId);
    } else if (e.key === 'Escape') {
      const chapter = chapters.find((c) => c.id === chapterId);
      if (chapter) {
        handleCancelEditNumber(chapter);
      }
    }
  };
  // detect container size and attach scroll handler (throttled to reduce flicker)
  useEffect(() => {
    const el = listContainerRef.current;
    if (!el) return;
    const onResize = () => setContainerHeight(el.clientHeight || 400);
    onResize();
    const obs = new ResizeObserver(onResize);
    obs.observe(el);
    const onScroll = () => {
      if (scrollTopRafRef.current !== null) return;
      scrollTopRafRef.current = requestAnimationFrame(() => {
        scrollTopRafRef.current = null;
        setScrollTop(el.scrollTop);
      });
    };
    el.addEventListener('scroll', onScroll);
    return () => {
      obs.disconnect();
      el.removeEventListener('scroll', onScroll);
      if (scrollTopRafRef.current !== null) cancelAnimationFrame(scrollTopRafRef.current);
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

  // Reset drag state when list updates (e.g. after upload) so we don't show the simplified
  // dragging template and lose role="group" / delete button in chapter-item-actions
  useEffect(() => {
    setIsDragging(false);
  }, [chapters.length]);

  // When selected chapter changes, center it in the visible list
  useEffect(() => {
    if (!selectedId || filteredChapters.length === 0) return;
    const index = filteredChapters.findIndex((c) => c.id === selectedId);
    if (index < 0) return;
    const el = listContainerRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    // Center the item: item top at (index * ITEM_HEIGHT), we want it in the middle of the viewport
    const targetScroll = index * ITEM_HEIGHT - el.clientHeight / 2 + ITEM_HEIGHT / 2;
    const clamped = Math.max(0, Math.min(maxScroll, Math.round(targetScroll)));
    el.scrollTop = clamped;
    setScrollTop(clamped);
  }, [selectedId, filteredChapters, containerHeight]);

  // dnd-kit drag start handler
  const handleDndStart = (_event: DragStartEvent) => {
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

    // stop edge-scroll animation
    if (edgeScrollRafRef.current !== null) {
      cancelAnimationFrame(edgeScrollRafRef.current);
      edgeScrollRafRef.current = null;
    }
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
      setError({
        title: t('chapter.errorReorder'),
        message: err instanceof Error ? err.message : t('chapter.errorReorder'),
      });
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
      setError({
        title: t('chapter.errorReorder'),
        message: err instanceof Error ? err.message : t('chapter.errorReorder'),
      });
      // refresh from server to ensure UI consistent
      if (onChaptersUpdate) await onChaptersUpdate();
    } finally {
      setIsReverting(false);
      setIsSavingOrder(false);
    }
  };

  // Edge auto-scroll: when dragging near top/bottom of visible list, scroll proportionally
  const runEdgeScroll = useCallback(() => {
    const el = listContainerRef.current;
    if (!el || !isDragging) return;
    const rect = el.getBoundingClientRect();
    const pointerY = pointerYRef.current;
    if (pointerY === null) return;
    const relY = pointerY - rect.top; // distance from top of visible area
    const maxScroll = el.scrollHeight - containerHeight;
    if (maxScroll <= 0) return;

    let delta = 0;
    if (relY < EDGE_SCROLL_ZONE && el.scrollTop > 0) {
      // In top zone: scroll up (negative delta). Closer to top = faster
      const t = 1 - relY / EDGE_SCROLL_ZONE;
      delta = -EDGE_SCROLL_SPEED_MAX * t;
    } else if (relY > rect.height - EDGE_SCROLL_ZONE && el.scrollTop < maxScroll) {
      // In bottom zone: scroll down. Closer to bottom = faster
      const t = (relY - (rect.height - EDGE_SCROLL_ZONE)) / EDGE_SCROLL_ZONE;
      delta = EDGE_SCROLL_SPEED_MAX * t;
    }

    if (delta !== 0) {
      el.scrollTop = Math.max(0, Math.min(maxScroll, el.scrollTop + delta));
      // State will update via throttled scroll listener
    }

    edgeScrollRafRef.current = requestAnimationFrame(runEdgeScroll);
  }, [containerHeight, isDragging]);

  const onPointerMove = (e: PointerEvent) => {
    pointerYRef.current = e.clientY;
    if (!isDragging) return;
    const el = listContainerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const relY = e.clientY - rect.top;

    // Start or continue edge-scroll when pointer is in zone
    const inTopZone = relY < EDGE_SCROLL_ZONE && el.scrollTop > 0;
    const inBottomZone =
      relY > rect.height - EDGE_SCROLL_ZONE && el.scrollTop < el.scrollHeight - containerHeight;
    if (inTopZone || inBottomZone) {
      if (edgeScrollRafRef.current === null)
        edgeScrollRafRef.current = requestAnimationFrame(runEdgeScroll);
    } else {
      if (edgeScrollRafRef.current !== null) {
        cancelAnimationFrame(edgeScrollRafRef.current);
        edgeScrollRafRef.current = null;
      }
    }
  };

  return (
    <Card
      title={
        <span class="chapter-list-card-title-wrap">
          <span class="chapter-list-card-title-left">
            {t('chapterList.title')} <CountBadge count={counts.all} />
            <span class="chapter-list-title-meta">
              {isSavingOrder && (
                <>
                  <span class="spinner chapter-list-title-spinner" />
                  <small class="chapter-list-title-note">{t('chapterList.savingOrder')}</small>
                </>
              )}
              {!isSavingOrder && undoAvailable && (
                <>
                  <small class="chapter-list-title-note chapter-list-title-note-spaced">
                    {isReverting ? t('chapterList.reverting') : t('chapterList.orderSaved')}
                  </small>
                  <button
                    class="small"
                    onClick={(e: JSX.TargetedMouseEvent<HTMLButtonElement>) => {
                      e.stopPropagation();
                      handleUndo();
                    }}
                    disabled={isReverting}
                  >
                    {isReverting ? t('chapterList.reverting') : t('chapterList.undo')}
                  </button>
                </>
              )}
            </span>
          </span>
          <button
            type="button"
            class={`chapter-reorder-toggle ${reorderMode ? 'active' : ''}`}
            onClick={(e: JSX.TargetedMouseEvent<HTMLButtonElement>) => {
              e.stopPropagation();
              toggleReorderMode();
            }}
            disabled={chapters.length < 2 || isDragging}
            aria-pressed={reorderMode}
            title={
              chapters.length < 2
                ? t('chapterList.reorderModeMinChapters')
                : reorderMode
                  ? t('chapterList.reorderModeDone')
                  : t('chapterList.reorderMode')
            }
          >
            <Icon name="swap_vert" size="sm" />
            <span class="chapter-reorder-toggle-label">
              {reorderMode ? t('chapterList.reorderModeDone') : t('chapterList.reorderMode')}
            </span>
          </button>
        </span>
      }
      className={`chapter-list-card${reorderMode ? ' is-reorder-mode' : ''}`}
    >
      <div class="chapter-search">
        <input
          type="text"
          class="chapter-search-input"
          placeholder={t('chapterList.searchPlaceholder')}
          value={search}
          disabled={reorderMode}
          onInput={(e: JSX.TargetedEvent<HTMLInputElement>) =>
            setSearch((e.target as HTMLInputElement).value)
          }
        />
      </div>

      <div class="chapter-filters">
        {(
          [
            'all',
            ...(originalReadingMode
              ? []
              : ([
                  'pending',
                  'completed',
                  'partial',
                  'draft',
                  'analyzed',
                  'error',
                ] as FilterType[])),
          ] as FilterType[]
        ).map((f) => {
          const label =
            f === 'all'
              ? t('chapterList.all')
              : f === 'pending'
                ? t('chapterList.filterPending')
                : f === 'completed'
                  ? t('chapterList.filterCompleted')
                  : f === 'partial'
                    ? t('chapterList.filterPartial')
                    : f === 'draft'
                      ? t('chapterList.filterDraft')
                      : f === 'analyzed'
                        ? t('chapterList.filterAnalyzed')
                        : t('chapterList.filterError');
          const labelShort =
            f === 'all'
              ? t('chapterList.all')
              : f === 'pending'
                ? t('chapterList.filterPendingShort')
                : f === 'completed'
                  ? t('chapterList.filterCompletedShort')
                  : f === 'partial'
                    ? t('chapterList.filterPartialShort')
                    : f === 'draft'
                      ? t('chapterList.filterDraftShort')
                      : f === 'analyzed'
                        ? t('chapterList.filterAnalyzedShort')
                        : t('chapterList.filterErrorShort');
          const iconName =
            f === 'all'
              ? 'grid_view'
              : f === 'pending'
                ? 'schedule'
                : f === 'completed'
                  ? 'check_circle'
                  : f === 'partial'
                    ? 'warning'
                    : f === 'draft'
                      ? 'edit_note'
                      : f === 'analyzed'
                        ? 'manage_search'
                        : 'error';
          return (
            <button
              key={f}
              class={`chapter-filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
              title={label}
              disabled={reorderMode}
            >
              <Icon name={iconName} size="sm" />
              <span class="chapter-filter-label chapter-filter-label-long">{label}</span>
              <span class="chapter-filter-label chapter-filter-label-short">{labelShort}</span>
            </button>
          );
        })}
      </div>

      {reorderMode && (
        <div class="chapter-reorder-bar" role="status">
          <div class="chapter-reorder-bar-top">
            <div class="chapter-reorder-bar-title-row">
              <Icon name="drag_indicator" size="sm" />
              <span>{t('chapterList.reorderModeTitle')}</span>
            </div>
            <Button variant="secondary" size="sm" onClick={toggleReorderMode} disabled={isDragging}>
              <Icon name="check" size="sm" /> {t('chapterList.reorderModeDone')}
            </Button>
          </div>
          <p class="chapter-reorder-bar-hint">{t('chapterList.reorderModeHint')}</p>
        </div>
      )}

      <DndContext
        sensors={sensors}
        onDragStart={handleDndStart}
        onDragEnd={handleDndEnd}
        collisionDetection={undefined}
        modifiers={[restrictToVerticalAxis]}
      >
        <div class="chapter-list" ref={listContainerRef}>
          {filteredChapters.length === 0 ? (
            <div class="chapter-list-empty">
              {chapters.length === 0 ? t('chapterList.noChapters') : t('chapterList.noResults')}
            </div>
          ) : (
            <SortableContext items={currentOrderedIds()} strategy={verticalListSortingStrategy}>
              {/* Always use virtualization, but with larger buffer during drag to avoid scroll jumps */}
              {(() => {
                const total = filteredChapters.length;
                const totalHeight = total * ITEM_HEIGHT;
                // Use larger buffer during drag to ensure dragged item and nearby items stay rendered
                const currentBuffer = isDragging ? DRAG_BUFFER : BUFFER;
                const start = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - currentBuffer);
                const end = Math.min(
                  total,
                  Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + currentBuffer
                );
                const slice = filteredChapters.slice(start, end);
                const paddingTop = start * ITEM_HEIGHT;
                const paddingBottom = Math.max(0, totalHeight - end * ITEM_HEIGHT);

                return (
                  <div style={{ height: totalHeight + 'px', position: 'relative' }}>
                    <div
                      style={{ paddingTop: paddingTop + 'px', paddingBottom: paddingBottom + 'px' }}
                    >
                      {slice.map((chapter) => (
                        <SortableItem id={chapter.id} key={chapter.id}>
                          {({ attributes, listeners }) => (
                            <div
                              class={`chapter-item ${selectedId === chapter.id ? 'active' : ''}${reorderMode ? ' chapter-item-reorder' : ''}`}
                              role={reorderMode ? undefined : 'button'}
                              tabIndex={reorderMode ? undefined : 0}
                              onClick={() => {
                                if (!reorderMode) onSelect(chapter.id);
                              }}
                              onKeyDown={(e) => {
                                if (reorderMode) return;
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  onSelect(chapter.id);
                                }
                              }}
                              title={chapterDisplayTitle(chapter)}
                              style={{
                                height: ITEM_HEIGHT + 'px',
                                boxSizing: 'border-box',
                              }}
                            >
                              {reorderMode && (
                                <button
                                  type="button"
                                  class="chapter-reorder-handle"
                                  title={t('chapterList.dragHandleTitle')}
                                  aria-label={t('chapterList.dragHandleTitle')}
                                  {...attributes}
                                  {...listeners}
                                  onClick={(e: JSX.TargetedMouseEvent<HTMLButtonElement>) =>
                                    e.stopPropagation()
                                  }
                                  style={isDragging ? { cursor: 'grabbing' } : undefined}
                                >
                                  <Icon name="drag_indicator" size="sm" />
                                </button>
                              )}
                              <div class="chapter-item-drag-area">
                                {reorderMode && editingNumber === chapter.id ? (
                                  <div
                                    class="chapter-number-edit"
                                    role="presentation"
                                    onClick={(e: JSX.TargetedMouseEvent<HTMLDivElement>) =>
                                      e.stopPropagation()
                                    }
                                    onPointerDown={(e: JSX.TargetedEvent<HTMLDivElement>) =>
                                      e.stopPropagation()
                                    }
                                  >
                                    <input
                                      ref={
                                        editingNumber === chapter.id ? numberInputRef : undefined
                                      }
                                      type="number"
                                      min="1"
                                      max={chapters.length}
                                      value={editedNumber}
                                      onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => {
                                        const value = parseInt(
                                          (e.target as HTMLInputElement).value,
                                          10
                                        );
                                        if (!isNaN(value)) {
                                          setEditedNumber(
                                            Math.max(1, Math.min(value, chapters.length))
                                          );
                                        }
                                      }}
                                      onKeyDown={(e: JSX.TargetedKeyboardEvent<HTMLInputElement>) =>
                                        handleNumberKeyDown(e, chapter.id)
                                      }
                                      onBlur={() => handleSaveNumber(chapter.id)}
                                      disabled={savingNumber}
                                      class="chapter-number-input"
                                      style={{ width: '3rem', textAlign: 'center' }}
                                    />
                                    <div class="chapter-number-edit-actions">
                                      <button
                                        class="chapter-number-save-btn"
                                        onClick={(e: JSX.TargetedMouseEvent<HTMLButtonElement>) => {
                                          e.stopPropagation();
                                          handleSaveNumber(chapter.id);
                                        }}
                                        disabled={savingNumber}
                                        title={t('chapterList.saveNumberTitle')}
                                      >
                                        <Icon name="check" size="sm" />
                                      </button>
                                      <button
                                        class="chapter-number-cancel-btn"
                                        onClick={(e: JSX.TargetedMouseEvent<HTMLButtonElement>) => {
                                          e.stopPropagation();
                                          handleCancelEditNumber(chapter);
                                        }}
                                        disabled={savingNumber}
                                        title={t('chapterList.cancelNumberTitle')}
                                      >
                                        <Icon name="close" size="sm" />
                                      </button>
                                    </div>
                                  </div>
                                ) : reorderMode ? (
                                  <button
                                    type="button"
                                    class="chapter-number"
                                    onClick={(e: JSX.TargetedMouseEvent<HTMLButtonElement>) =>
                                      handleStartEditNumber(chapter, e)
                                    }
                                    title={t('chapterList.editNumberTitle')}
                                    style={{
                                      cursor: 'pointer',
                                      background: 'none',
                                      border: 'none',
                                      padding: 0,
                                      font: 'inherit',
                                    }}
                                  >
                                    {chapter.number}
                                  </button>
                                ) : (
                                  <span class="chapter-number">{chapter.number}</span>
                                )}
                                <span class="chapter-item-title">
                                  {chapterDisplayTitle(chapter)}
                                </span>
                              </div>
                              {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
                              <div
                                class="chapter-item-actions"
                                role="group"
                                aria-label={t('chapterList.deleteTitle')}
                                onClick={(e: JSX.TargetedMouseEvent<HTMLDivElement>) =>
                                  e.stopPropagation()
                                }
                                onPointerDown={(e: JSX.TargetedEvent<HTMLDivElement>) =>
                                  e.stopPropagation()
                                }
                                onKeyDown={(e) =>
                                  e.key === 'Enter' || e.key === ' '
                                    ? e.stopPropagation()
                                    : undefined
                                }
                              >
                                {!originalReadingMode && (
                                  <span class={`chapter-status-icon is-${chapter.status}`}>
                                    {getStatusIcon(chapter.status)}
                                  </span>
                                )}
                                {onDelete && (
                                  <button
                                    type="button"
                                    class="chapter-delete-btn"
                                    onClick={(e: JSX.TargetedMouseEvent<HTMLButtonElement>) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      setDeleteConfirmId(chapter.id);
                                    }}
                                    onPointerDown={(e: JSX.TargetedEvent<HTMLButtonElement>) =>
                                      e.stopPropagation()
                                    }
                                    title={t('chapterList.deleteTitle')}
                                    disabled={deleting}
                                  >
                                    <Icon name="delete" size="sm" />
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
              })()}
            </SortableContext>
          )}
        </div>
      </DndContext>

      <div
        class={`upload-area ${dragover ? 'dragover' : ''}`}
        role="button"
        tabIndex={0}
        style={{ marginTop: '1rem' }}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDrop={handleFileDrop}
        onDragOver={handleFileDragOver}
        onDragLeave={handleFileDragLeave}
      >
        {uploading ? (
          <span class="spinner" />
        ) : (
          <>
            <div class="upload-icon">
              <Icon name="upload_file" />
            </div>
            <p dangerouslySetInnerHTML={{ __html: t('chapterList.dragFileOrClick') }} />
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.epub,.fb2,.csv"
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
          footer={<button onClick={() => setError(null)}>{t('common.close')}</button>}
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
              <button onClick={() => setDeleteConfirmId(null)} disabled={deleting}>
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
                class="chapter-delete-confirm-btn"
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
                  title:
                    sortedChapters.find((c) => c.id === deleteConfirmId)?.title ||
                    t('chapter.unknownChapter'),
                })}
              </p>
              <p class="chapter-delete-warning">{t('chapter.cannotUndo')}</p>
              <p class="chapter-delete-warning chapter-delete-warning-subtle">
                {t('chapterList.undo') || 'Undo is unavailable for deletion.'}
              </p>
            </>
          )}
        </Modal>

        {queue.length > 0 && !showUploadModal && (
          <div class="upload-queue-mini">
            <span class="upload-queue-mini-label">
              {t('chapterList.uploadQueue')} ({queue.length})
            </span>
            <Button variant="secondary" size="sm" onClick={() => setShowUploadModal(true)}>
              {t('chapterList.viewQueue') || 'View'}
            </Button>
          </div>
        )}

        {queue.length > 0 && (
          <Modal
            isOpen={showUploadModal}
            onClose={() => !processing && setShowUploadModal(false)}
            title={t('chapterList.uploadModalTitle') || t('chapterList.uploadQueue')}
            className="upload-queue-modal"
            preventClose={processing}
            footer={
              processing ? (
                <Button variant="secondary" size="sm" onClick={() => cancelQueue()}>
                  {t('chapterList.cancelQueue') || 'Cancel'}
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={() => setShowUploadModal(false)}>
                  {t('common.close')}
                </Button>
              )
            }
          >
            <div class="upload-queue-modal-body">
              <div class="upload-queue-header">
                <strong>{t('chapterList.uploadQueue') || 'Upload queue'}</strong>
                <span class="upload-queue-meta">
                  {queue.filter((q) => q.status === 'uploading').length > 0
                    ? `${t('chapterList.uploadSending')}: ${queue.filter((q) => q.status === 'uploading').length}`
                    : `${t('chapterList.all')}: ${queue.length}`}
                </span>
              </div>
              <div class="upload-queue-list">
                {queue.map((item) => (
                  <div key={item.id} class={`queue-item ${item.status}`}>
                    <div class="queue-item-left">
                      <span class={`queue-status ${item.status}`}>
                        {item.status === 'uploading' ? (
                          <Icon name="schedule" size="sm" />
                        ) : item.status === 'success' ? (
                          <Icon name="check_circle" size="sm" />
                        ) : item.status === 'error' ? (
                          <Icon name="error" size="sm" />
                        ) : item.status === 'canceled' ? (
                          <Icon name="cancel" size="sm" />
                        ) : (
                          <Icon name="radio_button_unchecked" size="sm" />
                        )}
                      </span>
                      <span class="queue-name">{item.file.name}</span>
                    </div>
                    {item.status === 'uploading' &&
                      item.uploadProgress &&
                      item.uploadProgress.total > 0 && (
                        <div class="queue-item-progress">
                          <div
                            class="queue-item-progress-bar"
                            style={{
                              width: `${Math.round(
                                (item.uploadProgress.loaded / item.uploadProgress.total) * 100
                              )}%`,
                            }}
                          />
                          <span class="queue-item-progress-text">
                            {item.uploadPhase === 'processing'
                              ? t('chapterList.uploadProcessing')
                              : `${t('chapterList.uploadSending')} ${Math.round(
                                  (item.uploadProgress.loaded / item.uploadProgress.total) * 100
                                )}%`}
                          </span>
                        </div>
                      )}
                    {item.status === 'uploading' &&
                      item.importJobId &&
                      item.importTotal !== undefined &&
                      item.importTotal > 0 && (
                        <div class="queue-item-import-meta">
                          <span>{`${item.importCurrent || 0}/${item.importTotal}`}</span>
                          {item.importCurrentChapterTitle && (
                            <span class="queue-item-import-title">
                              {item.importCurrentChapterTitle}
                            </span>
                          )}
                        </div>
                      )}
                    <div class="queue-item-actions">
                      {item.status === 'error' && (
                        <>
                          <Button variant="secondary" size="sm" onClick={() => retryItem(item.id)}>
                            {t('common.retry') || 'Retry'}
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => removeItem(item.id)}>
                            {t('common.remove') || 'Remove'}
                          </Button>
                        </>
                      )}
                      {(item.status === 'pending' || item.status === 'canceled') && (
                        <Button variant="secondary" size="sm" onClick={() => removeItem(item.id)}>
                          {t('common.remove') || 'Remove'}
                        </Button>
                      )}
                    </div>
                    {item.error && <pre class="queue-error">{item.error}</pre>}
                    {item.status === 'success' && item.warnings && item.warnings.length > 0 && (
                      <div class="queue-warnings">
                        {item.warnings.map((w, i) => (
                          <div key={i} class="queue-warning-item">
                            {w}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Modal>
        )}
      </div>
    </Card>
  );
}
