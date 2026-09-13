/**
 * Request-scoped AbortSignal for Vercel/Express invocations.
 * Worker jobs leave the store empty so OpenAI calls are not aborted.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

const abortStorage = new AsyncLocalStorage<AbortSignal>();

export function runWithAbortSignal<T>(signal: AbortSignal, fn: () => T): T {
  return abortStorage.run(signal, fn);
}

export function getInvocationAbortSignal(): AbortSignal | undefined {
  return abortStorage.getStore();
}

export function isInvocationAborted(): boolean {
  return getInvocationAbortSignal()?.aborted === true;
}

export function isInvocationAbortError(err: unknown): boolean {
  if (isInvocationAborted()) return true;
  if (!(err instanceof Error)) return false;
  return err.name === 'AbortError' || err.name === 'APIUserAbortError';
}
