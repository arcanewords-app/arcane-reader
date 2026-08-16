/** Pure helpers for chapter upload queue (unit-tested; hook stays thin). */

export const PARALLEL_LIMIT = 3;
export const IMPORT_POLL_INTERVAL_MIN_MS = 1500;
export const IMPORT_POLL_INTERVAL_MAX_MS = 8000;
export const IMPORT_POLL_BACKOFF_FACTOR = 1.5;
export const MAX_IMPORT_POLL_ATTEMPTS = 120;
export const SUPPORTED_UPLOAD_FORMATS = ['.txt', '.epub', '.fb2', '.csv'] as const;

export type UploadPhase = 'sending' | 'processing';

export type QueueItemStatus = 'pending' | 'uploading' | 'success' | 'error' | 'canceled';

export type QueueItemPatch = {
  status?: QueueItemStatus;
  error?: string;
  warnings?: string[];
  result?: unknown;
  retries?: number;
  uploadProgress?: { loaded: number; total: number };
  uploadPhase?: UploadPhase;
  importJobId?: string;
  importPhase?: string;
  importCurrent?: number;
  importTotal?: number;
  importCurrentChapterTitle?: string;
};

export function generateQueueItemId(now = Date.now(), rand = Math.random()): string {
  return `${now.toString(36)}-${Math.round(rand * 1e9)}`;
}

export function uploadPhaseFromProgress(loaded: number, total: number): UploadPhase {
  return total > 0 && loaded >= total ? 'processing' : 'sending';
}

/** Exponential backoff for import job polling; reset when state snapshot changes. */
export function nextImportPollDelay(
  previousDelayMs: number,
  hasStateChanged: boolean,
  options: {
    minMs?: number;
    maxMs?: number;
    factor?: number;
  } = {}
): number {
  const minMs = options.minMs ?? IMPORT_POLL_INTERVAL_MIN_MS;
  const maxMs = options.maxMs ?? IMPORT_POLL_INTERVAL_MAX_MS;
  const factor = options.factor ?? IMPORT_POLL_BACKOFF_FACTOR;
  if (hasStateChanged) return minMs;
  return Math.min(maxMs, Math.round(previousDelayMs * factor));
}

export function importJobSnapshot(state: {
  status: string;
  phase?: string | null;
  current?: number | null;
  total?: number | null;
  currentChapterTitle?: string | null;
}): string {
  return `${state.status}|${state.phase}|${state.current}|${state.total}|${state.currentChapterTitle ?? ''}`;
}

export function patchQueueItemById<T extends { id: string }>(
  queue: T[],
  id: string,
  patch: Partial<T>
): T[] {
  return queue.map((it) => (it.id === id ? { ...it, ...patch } : it));
}

export function removeQueueItemById<T extends { id: string }>(queue: T[], id: string): T[] {
  return queue.filter((it) => it.id !== id);
}

export function cancelPendingQueueItems<T extends { status: QueueItemStatus }>(queue: T[]): T[] {
  return queue.map((it) => (it.status === 'pending' ? { ...it, status: 'canceled' as const } : it));
}

export function pendingQueueItemIds<T extends { id: string; status: QueueItemStatus }>(
  queue: T[]
): string[] {
  return queue.filter((it) => it.status === 'pending').map((it) => it.id);
}

export function findNextPendingItem<T extends { status: QueueItemStatus }>(
  queue: T[]
): T | undefined {
  return queue.find((it) => it.status === 'pending');
}

export function canStartMoreUploads(inFlightCount: number, limit = PARALLEL_LIMIT): boolean {
  return inFlightCount < limit;
}

export function isSupportedUploadFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  return SUPPORTED_UPLOAD_FORMATS.some((ext) => lower.endsWith(ext));
}

export function normalizeUploadTitle(fileName: string, fallbackTitle: string): string {
  const noExt = fileName.replace(/\.[^.]+$/, '');
  const cleaned = noExt.replace(/^\d+[._\-\s]*/, '').trim();
  return cleaned || fallbackTitle;
}

export function buildUploadErrorDetails(params: {
  itemLabel: string;
  message?: string;
  errorDetails?: string;
  parseErrors?: string[];
}): string {
  let detailsText = params.itemLabel;
  if (params.message) detailsText += `\n\n${params.message}`;
  if (params.errorDetails) detailsText += `\n\n${params.errorDetails}`;
  if (params.parseErrors && params.parseErrors.length > 0) {
    detailsText += `\n\nОшибки парсинга:\n${params.parseErrors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;
  }
  return detailsText;
}

export function isAbortUploadError(err: { name?: string; message?: string }): boolean {
  return err.name === 'AbortError' || err.message === 'Request aborted';
}

export function extractUploadResultWarnings(result: unknown): string[] | undefined {
  if (result && typeof result === 'object' && 'warnings' in result) {
    return (result as { warnings?: string[] }).warnings;
  }
  return undefined;
}

export function markItemUploading<T extends { id: string }>(queue: T[], id: string): T[] {
  return patchQueueItemById(queue, id, {
    status: 'uploading',
    uploadProgress: undefined,
    uploadPhase: 'sending',
  } as Partial<T>);
}

export function markItemRetryPending<T extends { id: string; retries: number }>(
  queue: T[],
  id: string
): T[] {
  return queue.map((it) =>
    it.id === id
      ? { ...it, status: 'pending' as const, error: undefined, retries: it.retries + 1 }
      : it
  );
}
