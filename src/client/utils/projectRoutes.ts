/** Project overview `/projects/:projectId` — not chapter editor or reading. */
export function isProjectOverviewPath(pathname: string): boolean {
  return /^\/projects\/[^/]+$/.test(pathname);
}

export function getProjectIdFromOverviewPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)$/);
  return match ? match[1] : null;
}

/** Chapter editor `/projects/:projectId/chapters/:chapterId`. */
export function isProjectChapterEditorPath(pathname: string): boolean {
  return /^\/projects\/[^/]+\/chapters\/[^/]+$/.test(pathname);
}

export function parseProjectSearchFromUrl(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('search') ?? '';
}

export function parseChapterEditorQueryFromUrl(): { search: string; paragraph: string } {
  if (typeof window === 'undefined') return { search: '', paragraph: '' };
  const params = new URLSearchParams(window.location.search);
  return {
    search: params.get('search') ?? '',
    paragraph: params.get('paragraph') ?? '',
  };
}

export function buildProjectPageUrl(projectId: string, search?: string): string {
  const trimmed = search?.trim() ?? '';
  if (!trimmed) return `/projects/${projectId}`;
  const params = new URLSearchParams();
  params.set('search', trimmed);
  return `/projects/${projectId}?${params.toString()}`;
}

export function buildChapterEditorUrl(
  projectId: string,
  chapterId: string,
  opts?: { search?: string; paragraph?: string }
): string {
  const params = new URLSearchParams();
  const search = opts?.search?.trim() ?? '';
  if (search) params.set('search', search);
  if (opts?.paragraph) params.set('paragraph', opts.paragraph);
  const qs = params.toString();
  return `/projects/${projectId}/chapters/${chapterId}${qs ? `?${qs}` : ''}`;
}
