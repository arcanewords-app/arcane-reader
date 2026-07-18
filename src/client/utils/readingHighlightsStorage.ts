import type { AnchorRange } from './readingTextAnchors.js';
import { rangesOverlap } from './readingTextAnchors.js';

export const HIGHLIGHTS_STORAGE_KEY = 'arcane:highlights:v1';
export const HIGHLIGHTS_SCHEMA_VERSION = 1;
export const HIGHLIGHTS_TOTAL_MAX = 3000;

export interface StoredHighlight {
  id: string;
  sp: number;
  so: number;
  ep: number;
  eo: number;
  fp?: string;
}

interface HighlightsStore {
  schemaVersion: number;
  userId: string;
  pubs: Record<string, Record<string, StoredHighlight[]>>;
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;
let pendingStore: HighlightsStore | null = null;

function emptyStore(userId: string): HighlightsStore {
  return { schemaVersion: HIGHLIGHTS_SCHEMA_VERSION, userId, pubs: {} };
}

function readStore(): HighlightsStore | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(HIGHLIGHTS_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as HighlightsStore;
    if (parsed.schemaVersion !== HIGHLIGHTS_SCHEMA_VERSION || !parsed.userId || !parsed.pubs) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStoreImmediate(store: HighlightsStore): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(HIGHLIGHTS_STORAGE_KEY, JSON.stringify(store));
}

function scheduleWrite(store: HighlightsStore): void {
  pendingStore = store;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    if (pendingStore) writeStoreImmediate(pendingStore);
    pendingStore = null;
    writeTimer = null;
  }, 100);
}

function flushPendingStore(): void {
  if (!pendingStore) return;
  writeStoreImmediate(pendingStore);
  pendingStore = null;
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
}

function getStoreForUser(userId: string): HighlightsStore {
  if (pendingStore && pendingStore.userId !== userId) {
    flushPendingStore();
  }
  if (pendingStore?.userId === userId) {
    return pendingStore;
  }
  const existing = readStore();
  if (!existing || existing.userId !== userId) {
    return emptyStore(userId);
  }
  return existing;
}

export function fingerprintHighlightText(text: string): string {
  const normalized = text.trim();
  const slice =
    normalized.length <= 24 ? normalized : `${normalized.slice(0, 12)}${normalized.slice(-12)}`;
  let hash = 0;
  for (let i = 0; i < slice.length; i++) {
    hash = (hash * 31 + slice.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36).slice(0, 8);
}

export function countTotalHighlights(store: HighlightsStore): number {
  let count = 0;
  for (const publicationId of Object.keys(store.pubs)) {
    const chapters = store.pubs[publicationId];
    if (!chapters) continue;
    for (const chapterId of Object.keys(chapters)) {
      count += chapters[chapterId]?.length ?? 0;
    }
  }
  return count;
}

export function removeOldestHighlight(store: HighlightsStore): boolean {
  for (const publicationId of Object.keys(store.pubs)) {
    const chapters = store.pubs[publicationId];
    if (!chapters) continue;
    for (const chapterId of Object.keys(chapters)) {
      const highlights = chapters[chapterId];
      if (!highlights || highlights.length === 0) continue;
      highlights.shift();
      if (highlights.length === 0) {
        delete chapters[chapterId];
      }
      if (Object.keys(chapters).length === 0) {
        delete store.pubs[publicationId];
      }
      return true;
    }
  }
  return false;
}

export function enforceTotalCap(store: HighlightsStore, max = HIGHLIGHTS_TOTAL_MAX): boolean {
  while (countTotalHighlights(store) > max) {
    if (!removeOldestHighlight(store)) return false;
  }
  return true;
}

export function loadHighlights(
  userId: string,
  publicationId: string,
  chapterId: string
): StoredHighlight[] {
  const store = getStoreForUser(userId);
  return store.pubs[publicationId]?.[chapterId] ?? [];
}

export function saveHighlights(
  userId: string,
  publicationId: string,
  chapterId: string,
  highlights: StoredHighlight[]
): boolean {
  const store = getStoreForUser(userId);
  if (!store.pubs[publicationId]) store.pubs[publicationId] = {};
  store.pubs[publicationId]![chapterId] = highlights;
  if (!enforceTotalCap(store)) {
    scheduleWrite(store);
    return false;
  }
  scheduleWrite(store);
  return true;
}

export function removeHighlight(
  userId: string,
  publicationId: string,
  chapterId: string,
  highlightId: string
): StoredHighlight[] {
  const current = loadHighlights(userId, publicationId, chapterId);
  const next = current.filter((item) => item.id !== highlightId);
  saveHighlights(userId, publicationId, chapterId, next);
  return next;
}

export function toggleHighlightForRange(
  userId: string,
  publicationId: string,
  chapterId: string,
  range: AnchorRange,
  selectedText: string
): { highlights: StoredHighlight[]; added: boolean; storageFull: boolean } {
  const store = getStoreForUser(userId);
  const current = store.pubs[publicationId]?.[chapterId] ?? [];
  const overlapping = current.find((item) =>
    rangesOverlap(
      {
        startParagraph: item.sp,
        startOffset: item.so,
        endParagraph: item.ep,
        endOffset: item.eo,
      },
      range
    )
  );

  if (overlapping) {
    const next = current.filter((item) => item.id !== overlapping.id);
    saveHighlights(userId, publicationId, chapterId, next);
    return { highlights: next, added: false, storageFull: false };
  }

  const nextItem: StoredHighlight = {
    id: crypto.randomUUID(),
    sp: range.startParagraph,
    so: range.startOffset,
    ep: range.endParagraph,
    eo: range.endOffset,
    fp: fingerprintHighlightText(selectedText),
  };
  const next = [...current, nextItem];

  if (!store.pubs[publicationId]) store.pubs[publicationId] = {};
  store.pubs[publicationId]![chapterId] = next;

  while (countTotalHighlights(store) > HIGHLIGHTS_TOTAL_MAX) {
    if (!removeOldestHighlight(store)) {
      scheduleWrite(store);
      return {
        highlights: loadHighlights(userId, publicationId, chapterId),
        added: false,
        storageFull: true,
      };
    }
  }

  scheduleWrite(store);
  return {
    highlights: store.pubs[publicationId]![chapterId] ?? [],
    added: true,
    storageFull: false,
  };
}

export function subscribeHighlightsStorage(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: StorageEvent) => {
    if (event.key === HIGHLIGHTS_STORAGE_KEY) onChange();
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
