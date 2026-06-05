import type {
  CapturedHttpExchange,
  CapturedLlmCall,
  DebugTraceSummary,
  LogsResponse,
  TraceDetailResponse,
} from '@debug/shared/types';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

export async function fetchLogs(): Promise<LogsResponse> {
  return fetchJson<LogsResponse>('/api/debug/logs?newestFirst=1');
}

export async function fetchTraces(): Promise<{ traces: DebugTraceSummary[] }> {
  return fetchJson('/api/debug/traces');
}

export async function fetchTraceDetail(traceId: string): Promise<TraceDetailResponse> {
  return fetchJson(`/api/debug/traces/${encodeURIComponent(traceId)}`);
}

export async function fetchHttpCaptures(): Promise<{
  enabled: boolean;
  captures: CapturedHttpExchange[];
}> {
  return fetchJson('/api/debug/http');
}

export async function fetchPromptCaptures(): Promise<{
  enabled: boolean;
  captures: CapturedLlmCall[];
}> {
  return fetchJson('/api/debug/prompts');
}

export async function exportDebug(params: {
  format: string;
  traceId?: string;
  requestId?: string;
  jobId?: string;
}): Promise<string> {
  const q = new URLSearchParams({ format: params.format });
  if (params.traceId) q.set('traceId', params.traceId);
  if (params.requestId) q.set('requestId', params.requestId);
  if (params.jobId) q.set('jobId', params.jobId);
  return fetchText(`/api/debug/export?${q.toString()}`);
}

export async function clearLogs(): Promise<void> {
  await fetch('/api/debug/clear', { method: 'POST' });
}

export async function clearHttpCaptures(): Promise<void> {
  await fetch('/api/debug/clear-http', { method: 'POST' });
}

export async function clearPromptCaptures(): Promise<void> {
  await fetch('/api/debug/clear-prompts', { method: 'POST' });
}
