/**
 * Paths where token usage is relevant (cabinet, project management, chapter editing).
 * Excludes reading mode, catalog, publications, static pages.
 */
export function isTokenUsageRelevant(path: string): boolean {
  if (path === '/cabinet') return true;
  if (path.startsWith('/projects/') && !path.includes('/reading')) return true;
  return false;
}
