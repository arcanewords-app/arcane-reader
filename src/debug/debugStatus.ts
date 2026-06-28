/**
 * Lightweight debug buffer status for agents.
 */

import {
  getDebugLogEntries,
  getDebugTraces,
  getLastErrorEntry,
  getRecentJobIds,
  queryLogEntries,
} from './buffer.js';
import { getCapturedLlmCalls, isLlmCaptureEnabled } from './promptCapture.js';
import { getCapturedHttpExchanges, isHttpCaptureEnabled } from './httpCapture.js';
import { isDebugRedisBridgeAvailable } from './redisBridge.js';
import { isDebugPersistEnabled } from './persist.js';
import { DEFAULT_RELATIVE_WINDOW, resolveTimeWindow } from './timeWindow.js';

export interface DebugStatusWindow {
  last: string;
  since: string;
  logCount: number;
  recentJobIds: string[];
}

export interface DebugStatusResponse {
  logCount: number;
  httpCount: number;
  promptCount: number;
  traceCount: number;
  lastError: {
    time: string;
    msg?: string;
    event?: string;
    traceId?: string;
    jobId?: string;
    requestId?: string;
  } | null;
  recentJobIds: string[];
  window: DebugStatusWindow;
  workerBridge: boolean;
  captureFlags: { llm: boolean; http: boolean; persist: boolean };
}

export function getDebugStatus(): DebugStatusResponse {
  const last = getLastErrorEntry();
  const window = resolveTimeWindow({ last: DEFAULT_RELATIVE_WINDOW, applyDefault: true });
  const since = window.since ?? new Date(0).toISOString();
  const windowLogs = queryLogEntries({ since });

  return {
    logCount: getDebugLogEntries().length,
    httpCount: getCapturedHttpExchanges().length,
    promptCount: getCapturedLlmCalls().length,
    traceCount: getDebugTraces().length,
    lastError: last
      ? {
          time: String(last.time ?? ''),
          msg: typeof last.msg === 'string' ? last.msg : undefined,
          event: typeof last.event === 'string' ? last.event : undefined,
          traceId: typeof last.traceId === 'string' ? last.traceId : undefined,
          jobId: typeof last.jobId === 'string' ? last.jobId : undefined,
          requestId: typeof last.requestId === 'string' ? last.requestId : undefined,
        }
      : null,
    recentJobIds: getRecentJobIds(5, since),
    window: {
      last: window.lastApplied ?? DEFAULT_RELATIVE_WINDOW,
      since,
      logCount: windowLogs.length,
      recentJobIds: getRecentJobIds(5, since),
    },
    workerBridge: isDebugRedisBridgeAvailable(),
    captureFlags: {
      llm: isLlmCaptureEnabled(),
      http: isHttpCaptureEnabled(),
      persist: isDebugPersistEnabled(),
    },
  };
}
