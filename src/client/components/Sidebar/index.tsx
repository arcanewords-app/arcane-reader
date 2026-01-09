import { ProjectList } from './ProjectList';
import { ChapterList } from './ChapterList';
import { Button } from '../ui';
import type { Project, Chapter } from '../../types';

interface SidebarProps {
  project: Project | null;
  selectedProjectId: string | null;
  selectedChapterId: string | null;
  onSelectProject: (id: string) => void;
  onSelectChapter: (id: string) => void;
  onDeleteChapter?: (id: string) => void;
  onUploadChapter: (file: File, title: string) => Promise<void>;
  onOpenGlossary: () => void;
  onProjectCreated?: () => void;
  refreshTrigger?: number;
}

export function Sidebar({
  project,
  selectedProjectId,
  selectedChapterId,
  onSelectProject,
  onSelectChapter,
  onDeleteChapter,
  onUploadChapter,
  onOpenGlossary,
  onProjectCreated,
  refreshTrigger,
}: SidebarProps) {
  return (
    <aside class="sidebar">
      <ProjectList
        selectedId={selectedProjectId}
        onSelect={onSelectProject}
        onProjectCreated={onProjectCreated}
        refreshTrigger={refreshTrigger}
      />

      {project && (
        <>
          <ChapterList
            chapters={project.chapters}
            selectedId={selectedChapterId}
            onSelect={onSelectChapter}
            onDelete={onDeleteChapter}
            onUpload={onUploadChapter}
          />

          <Button variant="glossary" onClick={onOpenGlossary}>
            📝 Глоссарий{' '}
            <span class="glossary-count">{project.glossary.length}</span>
          </Button>
        </>
      )}
    </aside>
  );
}

export { ProjectList } from './ProjectList';
export { ChapterList } from './ChapterList';

