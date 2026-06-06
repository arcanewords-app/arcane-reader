import type { Project, ProjectWithChapterList } from '../storage/database.js';

/** Same lock policy as client UI: pair cannot change after glossary or non-pending chapters. */
export function isProjectLanguagePairLocked(
  project: Pick<Project | ProjectWithChapterList, 'glossary' | 'chapters'>
): boolean {
  return (
    project.glossary.length > 0 || project.chapters.some((chapter) => chapter.status !== 'pending')
  );
}
