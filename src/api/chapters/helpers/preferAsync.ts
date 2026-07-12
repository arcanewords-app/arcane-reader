/**
 * Detect async job preference from Prefer header or query.
 */

export interface PreferAsyncRequest {
  get(name: string): string | undefined;
  query?: Record<string, unknown>;
}

export function isPreferAsync(req: PreferAsyncRequest): boolean {
  const prefer = req.get('Prefer')?.toLowerCase() ?? '';
  if (prefer.includes('respond-async')) return true;
  const asyncParam = req.query?.async;
  return asyncParam === '1' || asyncParam === 'true';
}
