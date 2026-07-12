import { makeInFlightKey } from '../cache/keys.js';
import { fetchJson } from './fetchJson.js';

type InFlightCacheValue = Promise<unknown>;
const inFlightGetRequests = new Map<string, InFlightCacheValue>();

export async function fetchJsonDeduped<T>(url: string, options?: RequestInit): Promise<T> {
  const dedupeKey = makeInFlightKey(url, options);
  if (!dedupeKey) return fetchJson<T>(url, options);
  const existing = inFlightGetRequests.get(dedupeKey);
  if (existing) {
    return existing as Promise<T>;
  }
  const promise = fetchJson<T>(url, options).finally(() => {
    inFlightGetRequests.delete(dedupeKey);
  });
  inFlightGetRequests.set(dedupeKey, promise);
  return promise;
}

/** Test helper: reset in-flight dedupe map between tests. */
export function resetInFlightRequests(): void {
  inFlightGetRequests.clear();
}
