/**
 * Lightweight debug buffer status for agents.
 */

import {
  getDebugLogEntries,
  getDebugTraces,
  getLastErrorEntry,
  getRecentJobIds,
} from './buffer.js';
import { getCapturedLlmCalls, isLlmCaptureEnabled } from './promptCapture.js';
import { getCapturedHttpExchanges, isHttpCaptureEnabled } from './httpCapture.js';
import { isDebugRedisBridgeAvailable } from './redisBridge.js';
import { isDebugPersistEnabled } from './persist.js';

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
  workerBridge: boolean;
  captureFlags: { llm: boolean; http: boolean; persist: boolean };
}

export function getDebugStatus(): DebugStatusResponse {
  const last = getLastErrorEntry();
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
    recentJobIds: getRecentJobIds(5),
    workerBridge: isDebugRedisBridgeAvailable(),
    captureFlags: {
      llm: isLlmCaptureEnabled(),
      http: isHttpCaptureEnabled(),
      persist: isDebugPersistEnabled(),
    },
  };
}
