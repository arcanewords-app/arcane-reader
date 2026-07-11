import type { ChapterListItem, Project, ProjectWithChapterList } from '../types';

export function buildReadingChapterUrl(params: {
  isPublicationMode: boolean;
  publicationPath?: string;
  publicationId?: string;
  projectId?: string;
  chapterId: string;
}): string | null {
  const { isPublicationMode, publicationPath, publicationId, projectId, chapterId } = params;
  if (isPublicationMode) {
    const path = publicationPath ?? publicationId;
    if (!path) return null;
    return `/p/${path}/chapters/${chapterId}/reading`;
  }
  if (!projectId) return null;
  return `/projects/${projectId}/chapters/${chapterId}/reading`;
}

/** First chapter available in author reading mode (matches ReadingMode filter logic). */
export function getFirstAuthorReadingChapterId(
  project: Project | ProjectWithChapterList
): string | undefined {
  const isOriginalReadingMode = project.settings?.originalReadingMode ?? false;
  const projectChapters = project.chapters as ChapterListItem[];
  let availableChapters: ChapterListItem[];
  if (isOriginalReadingMode) {
    availableChapters = [...projectChapters].sort((a, b) => a.number - b.number);
  } else {
    availableChapters = projectChapters
      .filter(
        (ch) =>
          ch.hasTranslation ||
          ch.status === 'completed' ||
          ch.status === 'draft' ||
          ch.status === 'partial'
      )
      .sort((a, b) => a.number - b.number);
  }
  return availableChapters[0]?.id;
}
