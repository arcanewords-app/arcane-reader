import { useState, useRef, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.js';
import type { Chapter } from '../../types.js';
import { isJobBasedUploadFormat } from './chapterUploadQueueUtils.js';
import {
  MAX_IMPORT_POLL_ATTEMPTS,
  PARALLEL_LIMIT,
  buildUploadErrorDetails,
  canStartMoreUploads,
  cancelPendingQueueItems,
  extractUploadResultWarnings,
  findNextPendingItem,
  generateQueueItemId,
  importJobSnapshot,
  isAbortUploadError,
  isSupportedUploadFilename,
  markItemRetryPending,
  markItemUploading,
  nextImportPollDelay,
  normalizeUploadTitle,
  patchQueueItemById,
  pendingQueueItemIds,
  removeQueueItemById,
  uploadPhaseFromProgress,
} from './chapterUploadQueueCore.js';

export { isJobBasedUploadFormat } from './chapterUploadQueueUtils.js';

export type ChapterUploadQueueItem = {
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

export type ChapterUploadHandler = (params: {
  file: File;
  title: string;
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number) => void;
}) => Promise<Chapter | { chapters: Chapter[]; count: number; warnings?: string[] }>;

export interface UseChapterUploadQueueOptions {
  projectId: string | null;
  chapterCount: number;
  maxFileSize: number;
  onUpload: ChapterUploadHandler;
  onChaptersUpdate?: () => void | Promise<void>;
  onError?: (error: { title: string; message: string }) => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useChapterUploadQueue({
  projectId,
  chapterCount,
  maxFileSize,
  onUpload,
  onChaptersUpdate,
  onError,
}: UseChapterUploadQueueOptions) {
  const { t } = useTranslation();
  const [queue, setQueue] = useState<ChapterUploadQueueItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const processingRef = useRef(false);
  const queueRef = useRef<ChapterUploadQueueItem[]>([]);
  const currentAbortRef = useRef<AbortController | null>(null);
  const activeAbortRef = useRef<Map<string, AbortController>>(new Map());
  const removalTimeoutsRef = useRef<Record<string, number>>({});

  const scheduleRemove = (id: string, delay = 3000) => {
    const existing = removalTimeoutsRef.current[id];
    if (existing) {
      clearTimeout(existing);
    }
    const tid = window.setTimeout(() => {
      setQueue((prev) => {
        const next = removeQueueItemById(prev, id);
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

  useEffect(() => {
    return () => {
      Object.values(removalTimeoutsRef.current).forEach((tid) => clearTimeout(tid));
      removalTimeoutsRef.current = {};
    };
  }, []);

  const refreshChaptersSafely = async (reason: string) => {
    if (!onChaptersUpdate) return;
    try {
      await onChaptersUpdate();
    } catch (err) {
      console.warn(`Refresh after ${reason} failed`, err);
    }
  };

  const processOneItem = async (current: ChapterUploadQueueItem): Promise<boolean> => {
    const controller = new AbortController();
    activeAbortRef.current.set(current.id, controller);
    currentAbortRef.current = controller;

    setQueue((prev) => {
      const next = markItemUploading(prev, current.id);
      queueRef.current = next;
      return next;
    });

    const onProgress = (loaded: number, total: number) => {
      const phase = uploadPhaseFromProgress(loaded, total);
      setQueue((prev) => {
        const next = patchQueueItemById(prev, current.id, {
          uploadProgress: { loaded, total },
          uploadPhase: phase,
        });
        queueRef.current = next;
        return next;
      });
    };

    const itemLabel = `${t('chapterList.selectedFile') || 'File'}: ${current.file.name}`;

    try {
      if (isJobBasedUploadFormat(current.file.name)) {
        const job = await api.startImportJob(
          projectId as string,
          current.file,
          current.title,
          controller.signal,
          onProgress
        );
        setQueue((prev) => {
          const next = patchQueueItemById(prev, current.id, {
            importJobId: job.jobId,
            uploadPhase: 'processing',
          });
          queueRef.current = next;
          return next;
        });

        let pollDelayMs = nextImportPollDelay(0, true);
        let previousSnapshot = '';
        let importPollAttempt = 0;

        while (true) {
          importPollAttempt++;
          if (importPollAttempt > MAX_IMPORT_POLL_ATTEMPTS) {
            const msg = t('chapterList.importJobLost');
            setQueue((prev) => {
              const next = patchQueueItemById(prev, current.id, {
                status: 'error',
                error: msg,
              });
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
              const next = patchQueueItemById(prev, current.id, {
                status: 'error',
                error: msg,
              });
              queueRef.current = next;
              return next;
            });
            await refreshChaptersSafely('import error');
            return false;
          }
          const currentSnapshot = importJobSnapshot(state);
          const hasStateChanged = currentSnapshot !== previousSnapshot;
          previousSnapshot = currentSnapshot;

          setQueue((prev) => {
            const next = prev.map((it) =>
              it.id === current.id
                ? {
                    ...it,
                    uploadPhase:
                      state.status === 'processing' ? ('processing' as const) : it.uploadPhase,
                    importPhase: state.phase ?? undefined,
                    importCurrent: state.current,
                    importTotal: state.total,
                    importCurrentChapterTitle: state.currentChapterTitle,
                  }
                : it
            );
            queueRef.current = next;
            return next;
          });

          if (state.status === 'completed') {
            setQueue((prev) => {
              const next = patchQueueItemById(prev, current.id, {
                status: 'success',
                result: state,
                warnings: state.warnings,
              });
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
              const next = patchQueueItemById(prev, current.id, {
                status: 'error',
                error: `${itemLabel}\n\n${details}`,
                warnings: state.warnings,
              });
              queueRef.current = next;
              return next;
            });
            await refreshChaptersSafely('import error');
            return true;
          }

          if (state.status === 'canceled') {
            setQueue((prev) => {
              const next = patchQueueItemById(prev, current.id, {
                status: 'canceled',
                error: 'Canceled',
              });
              queueRef.current = next;
              return next;
            });
            scheduleRemove(current.id, 3000);
            await refreshChaptersSafely('import cancel');
            return false;
          }

          pollDelayMs = nextImportPollDelay(pollDelayMs, hasStateChanged);
          await sleep(pollDelayMs);
        }
      }

      const result = await onUpload({
        file: current.file,
        title: current.title,
        signal: controller.signal,
        onProgress,
      });

      const resultWarnings = extractUploadResultWarnings(result);

      setQueue((prev) => {
        const next = patchQueueItemById(prev, current.id, {
          status: 'success',
          result,
          warnings: resultWarnings,
        });
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
      if (isAbortUploadError(errObj)) {
        setQueue((prev) => {
          const next = patchQueueItemById(prev, current.id, {
            status: 'canceled',
            error: 'Canceled',
          });
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

      const detailsText = buildUploadErrorDetails({
        itemLabel,
        message: errObj.message,
        errorDetails,
        parseErrors,
      });

      setQueue((prev) => {
        const next = patchQueueItemById(prev, current.id, {
          status: 'error',
          error: detailsText,
          warnings,
        });
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
        while (canStartMoreUploads(inFlight.length, PARALLEL_LIMIT)) {
          const next = findNextPendingItem(queueRef.current);
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

  const addFiles = (fileList: FileList | File[]) => {
    if (!projectId) {
      onError?.({ title: t('chapterList.uploadError'), message: 'No project selected' });
      return;
    }

    const newItems: ChapterUploadQueueItem[] = Array.from(fileList).map((file, index) => {
      const supported = isSupportedUploadFilename(file.name);
      return {
        id: generateQueueItemId(),
        file,
        title: normalizeUploadTitle(
          file.name,
          t('chapterList.defaultChapterTitle', { number: chapterCount + index + 1 })
        ),
        status: supported ? ('pending' as const) : ('error' as const),
        error: supported ? undefined : `${t('chapterList.unsupportedFormat')}: ${file.name}`,
        warnings: [],
        retries: 0,
      };
    });

    newItems.forEach((it) => {
      if (it.file.size > maxFileSize) {
        it.status = 'error';
        it.error = `${t('chapterList.uploadError')}: ${t('chapterList.fileTooLarge') || 'File too large'}`;
      }
    });

    setQueue((q) => {
      const next = [...q, ...newItems];
      queueRef.current = next;
      return next;
    });
    setShowUploadModal(true);
    setTimeout(() => startProcessing(), 0);
  };

  const cancelQueue = () => {
    activeAbortRef.current.forEach((c) => c.abort());
    activeAbortRef.current.clear();
    if (currentAbortRef.current) {
      currentAbortRef.current.abort();
    }
    const pendingIds = pendingQueueItemIds(queueRef.current);
    setQueue((prev) => {
      const next = cancelPendingQueueItems(prev);
      queueRef.current = next;
      return next;
    });
    if (projectId) {
      queueRef.current
        .filter((it) => it.status === 'uploading' && it.importJobId)
        .forEach((it) => {
          void api.cancelImportJob(projectId, it.importJobId as string).catch(() => {});
        });
      if (onChaptersUpdate) {
        setTimeout(() => {
          void refreshChaptersSafely('cancel queue');
        }, 1200);
      }
    }
    pendingIds.forEach((id) => scheduleRemove(id, 3000));
  };

  const retryItem = (id: string) => {
    clearRemovalTimeout(id);
    setQueue((prev) => {
      const next = markItemRetryPending(prev, id);
      queueRef.current = next;
      return next;
    });
    setTimeout(() => startProcessing(), 0);
  };

  const removeItem = (id: string) => {
    clearRemovalTimeout(id);
    setQueue((prev) => {
      const next = removeQueueItemById(prev, id);
      queueRef.current = next;
      return next;
    });
  };

  return {
    queue,
    uploading,
    processing,
    showUploadModal,
    setShowUploadModal,
    addFiles,
    cancelQueue,
    retryItem,
    removeItem,
  };
}
