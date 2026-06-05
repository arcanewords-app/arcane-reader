import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

export function useClipboard() {
  const [toast, setToast] = useState({ message: 'Copied', visible: false });
  const timerRef = useRef<number | null>(null);

  const showToast = useCallback((message = 'Copied') => {
    setToast({ message, visible: true });
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setToast((t) => ({ ...t, visible: false }));
    }, 2000);
  }, []);

  const copyText = useCallback(
    async (text: string, toastMsg = 'Copied') => {
      try {
        await navigator.clipboard.writeText(text);
        showToast(toastMsg);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast(toastMsg);
      }
    },
    [showToast]
  );

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    []
  );

  return { copyText, showToast, toast };
}

export function useAutoRefresh(enabled: boolean, intervalSec: number, onRefresh: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const ms = Math.max(1, intervalSec) * 1000;
    const id = window.setInterval(onRefresh, ms);
    return () => window.clearInterval(id);
  }, [enabled, intervalSec, onRefresh]);
}

export function useDebugFetch<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh, setData };
}
