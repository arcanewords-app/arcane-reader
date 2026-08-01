import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api } from '../api/client';
import { subscribeToUserCacheInvalidation } from '../api/cache/invalidation';
import { authService } from '../services/authService';

export interface ReadingHistoryItem {
  publicationId: string;
  title: string | null;
  coverImageUrl: string | null;
  slug: string | null;
  totalChapters: number;
  readCount: number;
  lastReadChapterNumber: number;
  continueChapterId: string | null;
  lastReadAt: string | null;
}

export type ReadingHistoryMap = Record<
  string,
  { lastReadChapterNumber: number; continueChapterId: string | null }
>;

export function buildReadingHistoryMap(items: ReadingHistoryItem[]): ReadingHistoryMap {
  const map: ReadingHistoryMap = {};
  for (const item of items) {
    map[item.publicationId] = {
      lastReadChapterNumber: item.lastReadChapterNumber,
      continueChapterId: item.continueChapterId,
    };
  }
  return map;
}

export function useReadingHistory() {
  const [items, setItems] = useState<ReadingHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const loadIdRef = useRef(0);

  const reload = useCallback(async () => {
    if (!authService.getToken()) {
      setItems([]);
      return;
    }
    const loadId = ++loadIdRef.current;
    try {
      const { items: data } = await api.getReadingHistory();
      if (loadIdRef.current !== loadId) return;
      setItems(data);
    } catch {
      if (loadIdRef.current !== loadId) return;
      setItems([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reload().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    const unsubCache = subscribeToUserCacheInvalidation(() => reload());
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      unsubCache();
    };
  }, [reload]);

  const removeItem = useCallback((publicationId: string) => {
    setItems((prev) => prev.filter((item) => item.publicationId !== publicationId));
  }, []);

  const readingHistoryMap = useMemo(() => buildReadingHistoryMap(items), [items]);

  return { items, loading, reload, removeItem, readingHistoryMap };
}
