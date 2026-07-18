import { AUTH_CHANGED_EVENT } from '../../services/authService.js';
import { CACHE_SCHEMA_VERSION } from '../../../shared/cacheContract.js';
import { clearUserScopedCaches } from './memoryCache.js';

const CACHE_INVALIDATION_EVENT = 'arcane:cache-invalidate';
export const CACHE_INVALIDATION_KEY = 'arcane.cache.invalidate';

export type CacheScope = 'user';

const cacheChannel =
  typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel(CACHE_INVALIDATION_EVENT)
    : null;

export function emitCacheInvalidation(scope: CacheScope): void {
  if (typeof window === 'undefined') return;
  const payload = JSON.stringify({ scope, ts: Date.now(), version: CACHE_SCHEMA_VERSION });
  cacheChannel?.postMessage(payload);
  localStorage.setItem(CACHE_INVALIDATION_KEY, payload);
}

/** Subscribe to user-scoped cache invalidation (same tab + cross-tab). */
export function subscribeToUserCacheInvalidation(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (raw: string) => {
    try {
      const payload = JSON.parse(raw) as { scope?: CacheScope };
      if (payload.scope === 'user') callback();
    } catch {
      // ignore invalid payload
    }
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== CACHE_INVALIDATION_KEY || !event.newValue) return;
    handler(event.newValue);
  };
  const onChannel = (event: MessageEvent<string>) => handler(event.data);

  window.addEventListener('storage', onStorage);
  cacheChannel?.addEventListener('message', onChannel);

  return () => {
    window.removeEventListener('storage', onStorage);
    cacheChannel?.removeEventListener('message', onChannel);
  };
}

function handleInvalidationPayload(raw: string): void {
  try {
    const payload = JSON.parse(raw) as { scope?: CacheScope };
    if (payload.scope === 'user') {
      clearUserScopedCaches();
    }
  } catch {
    // ignore invalid payload
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener(AUTH_CHANGED_EVENT, () => {
    clearUserScopedCaches();
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== CACHE_INVALIDATION_KEY || !event.newValue) return;
    handleInvalidationPayload(event.newValue);
  });

  cacheChannel?.addEventListener('message', (event: MessageEvent<string>) => {
    handleInvalidationPayload(event.data);
  });
}
