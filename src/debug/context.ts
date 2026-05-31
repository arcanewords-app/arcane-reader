/**
 * Request-scoped debug context for log correlation (traceId, chapterId, jobId).
 * Used by engine logger and performTranslation / job runners.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface DebugContext {
  traceId?: string;
  requestId?: string;
  projectId?: string;
  chapterId?: string;
  jobId?: string;
  stage?: string;
}

const storage = new AsyncLocalStorage<DebugContext>();

export function getDebugContext(): DebugContext | undefined {
  return storage.getStore();
}

export function runWithDebugContext<T>(ctx: DebugContext, fn: () => T): T {
  const parent = storage.getStore();
  return storage.run({ ...parent, ...ctx }, fn);
}

export async function runWithDebugContextAsync<T>(
  ctx: DebugContext,
  fn: () => Promise<T>
): Promise<T> {
  const parent = storage.getStore();
  return storage.run({ ...parent, ...ctx }, fn);
}

export function createTraceId(): string {
  return randomUUID();
}

/** Merge ALS context into a log payload object. */
export function mergeDebugContext(data?: Record<string, unknown>): Record<string, unknown> {
  const ctx = getDebugContext();
  if (!ctx) return data ?? {};
  const merged: Record<string, unknown> = { ...data };
  if (ctx.traceId && merged.traceId === undefined) merged.traceId = ctx.traceId;
  if (ctx.requestId && merged.requestId === undefined) merged.requestId = ctx.requestId;
  if (ctx.projectId && merged.projectId === undefined) merged.projectId = ctx.projectId;
  if (ctx.chapterId && merged.chapterId === undefined) merged.chapterId = ctx.chapterId;
  if (ctx.jobId && merged.jobId === undefined) merged.jobId = ctx.jobId;
  if (ctx.stage && merged.stage === undefined) merged.stage = ctx.stage;
  return merged;
}
