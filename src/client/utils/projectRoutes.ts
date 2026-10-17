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

export function parseProjectLangFromUrl(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('lang') ?? '';
}

export function buildProjectPageUrl(projectId: string, search?: string, lang?: string): string {
  const params = new URLSearchParams();
  const trimmed = search?.trim() ?? '';
  if (trimmed) params.set('search', trimmed);
  if (lang) params.set('lang', lang);
  const qs = params.toString();
  return qs ? `/projects/${projectId}?${qs}` : `/projects/${projectId}`;
}

export function buildChapterEditorUrl(
  projectId: string,
  chapterId: string,
  opts?: { search?: string; paragraph?: string; lang?: string }
): string {
  const params = new URLSearchParams();
  const search = opts?.search?.trim() ?? '';
  if (search) params.set('search', search);
  if (opts?.paragraph) params.set('paragraph', opts.paragraph);
  if (opts?.lang) params.set('lang', opts.lang);
  const qs = params.toString();
  return `/projects/${projectId}/chapters/${chapterId}${qs ? `?${qs}` : ''}`;
}
