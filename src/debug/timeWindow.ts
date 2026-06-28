/**
 * Relative time windows for debug query filters.
 */

export const DEFAULT_RELATIVE_WINDOW = '2h';

const LAST_PATTERN = /^(\d+)(m|h|d)$/i;

export function parseRelativeLast(last: string): number | null {
  const trimmed = last.trim();
  const match = trimmed.match(LAST_PATTERN);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = match[2].toLowerCase();
  if (unit === 'm') return n * 60 * 1000;
  if (unit === 'h') return n * 60 * 60 * 1000;
  if (unit === 'd') return n * 24 * 60 * 60 * 1000;
  return null;
}

export function hasCorrelationId(params: {
  traceId?: string;
  jobId?: string;
  requestId?: string;
}): boolean {
  return !!(params.traceId || params.jobId || params.requestId);
}

export interface TimeWindowInput {
  since?: string;
  until?: string;
  last?: string;
  traceId?: string;
  jobId?: string;
  requestId?: string;
  /** When false, never apply default last window */
  applyDefault?: boolean;
}

export interface ResolvedTimeWindow {
  since?: string;
  until?: string;
  /** Relative window label applied (e.g. 2h) */
  lastApplied?: string;
}

export function resolveTimeWindow(params: TimeWindowInput): ResolvedTimeWindow {
  if (params.since || params.until) {
    return { since: params.since, until: params.until };
  }

  const hasCorrelation = hasCorrelationId(params);
  const last =
    params.last ??
    (params.applyDefault !== false && !hasCorrelation ? DEFAULT_RELATIVE_WINDOW : undefined);

  if (!last) return {};

  const ms = parseRelativeLast(last);
  if (ms == null) return {};

  return {
    since: new Date(Date.now() - ms).toISOString(),
    lastApplied: last,
  };
}
