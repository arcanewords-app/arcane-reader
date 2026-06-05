import { useCallback, useEffect, useState } from 'preact/hooks';
import type { DebugTab } from '@debug/shared/types';

export interface LogFilters {
  level: string;
  event: string;
  process: string;
  traceId: string;
  requestId: string;
  chapterId: string;
  projectId: string;
  jobId: string;
  search: string;
  preset: string;
}

export const DEFAULT_LOG_FILTERS: LogFilters = {
  level: '',
  event: '',
  process: '',
  traceId: '',
  requestId: '',
  chapterId: '',
  projectId: '',
  jobId: '',
  search: '',
  preset: '',
};

export function useUrlSync() {
  const [tab, setTabState] = useState<DebugTab>(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get('tab');
    if (t === 'traces' || t === 'http' || t === 'prompts') return t;
    return 'logs';
  });

  const [logFilters, setLogFiltersState] = useState<LogFilters>(() => {
    const p = new URLSearchParams(window.location.search);
    return {
      level: p.get('level') ?? '',
      event: p.get('event') ?? '',
      process: p.get('process') ?? '',
      traceId: p.get('traceId') ?? '',
      requestId: p.get('requestId') ?? '',
      chapterId: p.get('chapterId') ?? '',
      projectId: p.get('projectId') ?? '',
      jobId: p.get('jobId') ?? '',
      search: p.get('q') ?? '',
      preset: p.get('preset') ?? '',
    };
  });

  const writeUrl = useCallback((nextTab: DebugTab, filters: LogFilters) => {
    const p = new URLSearchParams();
    if (filters.level) p.set('level', filters.level);
    if (filters.event) p.set('event', filters.event);
    if (filters.process) p.set('process', filters.process);
    if (filters.chapterId) p.set('chapterId', filters.chapterId);
    if (filters.projectId) p.set('projectId', filters.projectId);
    if (filters.traceId) p.set('traceId', filters.traceId);
    if (filters.requestId) p.set('requestId', filters.requestId);
    if (filters.jobId) p.set('jobId', filters.jobId);
    if (filters.search) p.set('q', filters.search);
    if (filters.preset) p.set('preset', filters.preset);
    if (nextTab !== 'logs') p.set('tab', nextTab);
    const qs = p.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, []);

  const setTab = useCallback(
    (nextTab: DebugTab) => {
      setTabState(nextTab);
      writeUrl(nextTab, logFilters);
    },
    [logFilters, writeUrl]
  );

  const setLogFilters = useCallback(
    (patch: Partial<LogFilters>) => {
      setLogFiltersState((prev) => {
        const next = { ...prev, ...patch };
        writeUrl(tab, next);
        return next;
      });
    },
    [tab, writeUrl]
  );

  const filterLogsByCorrelation = useCallback(
    (id: string) => {
      setLogFilters({ traceId: id, requestId: '' });
      setTabState('logs');
      writeUrl('logs', { ...logFilters, traceId: id, requestId: '' });
    },
    [logFilters, writeUrl]
  );

  const filterLogsByRequestId = useCallback(
    (requestId: string) => {
      setLogFilters({ requestId, traceId: '' });
      setTabState('logs');
      writeUrl('logs', { ...logFilters, requestId, traceId: '' });
    },
    [logFilters, writeUrl]
  );

  useEffect(() => {
    writeUrl(tab, logFilters);
  }, []); // sync initial URL on mount

  return {
    tab,
    setTab,
    logFilters,
    setLogFilters,
    filterLogsByCorrelation,
    filterLogsByRequestId,
  };
}

export function matchesPreset(
  entry: { level?: string; event?: string; msg?: string },
  preset: string
): boolean {
  if (!preset) return true;
  if (preset === 'errors') return entry.level === 'error' || entry.level === 'fatal';
  if (preset === 'translation') {
    const ev = entry.event ?? '';
    return ev.startsWith('translation') || ev.startsWith('pipeline');
  }
  if (preset === 'pipeline') {
    const m = (entry.msg ?? '').toLowerCase();
    return m.includes('pipeline') || m.includes('stage') || m.includes('chunk');
  }
  return true;
}

export function entryMatchesFilters(
  entry: {
    level?: string;
    event?: string;
    process?: string;
    traceId?: string;
    requestId?: string;
    chapterId?: string;
    projectId?: string;
    jobId?: string;
    msg?: string;
    [key: string]: unknown;
  },
  filters: LogFilters
): boolean {
  if (filters.level && entry.level !== filters.level) return false;
  if (filters.event && entry.event !== filters.event) return false;
  if (filters.process && entry.process !== filters.process) return false;
  if (
    filters.traceId &&
    entry.traceId !== filters.traceId &&
    entry.jobId !== filters.traceId &&
    entry.requestId !== filters.traceId
  )
    return false;
  if (
    filters.requestId &&
    entry.requestId !== filters.requestId &&
    entry.traceId !== filters.requestId &&
    entry.jobId !== filters.requestId
  )
    return false;
  if (filters.chapterId && entry.chapterId !== filters.chapterId) return false;
  if (filters.projectId && entry.projectId !== filters.projectId) return false;
  if (filters.jobId && entry.jobId !== filters.jobId) return false;
  if (!matchesPreset(entry, filters.preset)) return false;
  if (filters.search) {
    const text = JSON.stringify(entry).toLowerCase();
    if (!text.includes(filters.search.toLowerCase())) return false;
  }
  return true;
}
