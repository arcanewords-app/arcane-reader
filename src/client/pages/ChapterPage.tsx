import { useEffect, useState, useRef } from 'preact/hooks';
import { route } from 'preact-router';
import type { Project, Chapter, ProjectSettings } from '../types';
import { getProject, invalidateProject } from '../store/projects';
import { ChapterView } from '../components/ChapterView';
import { Sidebar } from '../components/Sidebar';
import { GlossaryModal } from '../components/Glossary';
import { api } from '../api/client';

interface ChapterPageProps {
  projectId: string;
  chapterId: string;
}

export function ChapterPage({ projectId, chapterId }: ChapterPageProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const previousProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    // If projectId changed, invalidate previous project cache
    if (previousProjectIdRef.current && previousProjectIdRef.current !== projectId) {
      invalidateProject(previousProjectIdRef.current);
    }
    previousProjectIdRef.current = projectId;
    
    loadProject();
  }, [projectId]);

  const loadProject = async () => {
    setLoading(true);
    try {
      // Always refresh when navigating to a project to ensure fresh data
      // Cache will still be used internally if it's very fresh (< 5 seconds)
      const loadedProject = await getProject(projectId, true);
      if (loadedProject) {
        setProject(loadedProject);
      } else {
        route('/');
      }
    } catch (error) {
      console.error('Failed to load project:', error);
      route('/');
    } finally {
      setLoading(false);
    }
  };

  const handleChapterUpdate = (chapter: Chapter) => {
    if (!project) return;
    setProject({
      ...project,
      chapters: project.chapters.map((c) => (c.id === chapter.id ? chapter : c)),
    });
  };

  const handleSettingsChange = (settings: ProjectSettings) => {
    if (!project) return;
    setProject({ ...project, settings });
  };

  const handleRefreshProject = async () => {
    if (!project) return;
    // Invalidate cache to force fresh data
    invalidateProject(project.id);
    // Load fresh project data from store (which will fetch from API)
    const updated = await getProject(project.id, true);
    if (updated) {
      setProject(updated);
    }
  };

  const handleEnterReadingMode = () => {
    route(`/projects/${projectId}/chapters/${chapterId}/reading`);
  };

  if (loading || !project) {
    return <div>Загрузка...</div>;
  }

  const sortedChapters = [...project.chapters].sort((a, b) => a.number - b.number);
  const currentChapter = sortedChapters.find((c) => c.id === chapterId);
  const chapterIndex = sortedChapters.findIndex((c) => c.id === chapterId);

  if (!currentChapter) {
    route(`/projects/${projectId}`);
    return null;
  }

  const handlePrevChapter = () => {
    if (chapterIndex > 0) {
      route(`/projects/${projectId}/chapters/${sortedChapters[chapterIndex - 1].id}`);
    }
  };

  const handleNextChapter = () => {
    if (chapterIndex < sortedChapters.length - 1) {
      route(`/projects/${projectId}/chapters/${sortedChapters[chapterIndex + 1].id}`);
    }
  };

  // Get sidebar state from AppRouter (stored in window for cross-component communication)
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);

  useEffect(() => {
    // Listen for sidebar state changes from AppRouter
    const handleSidebarState = () => {
      const state = (window as any).__arcaneSidebarOpen;
      if (state !== undefined) {
        setSidebarOpen(state);
      }
    };

    // Check initial state
    handleSidebarState();

    // Listen for custom events from AppRouter
    window.addEventListener('arcane:sidebar-change', handleSidebarState);
    return () => {
      window.removeEventListener('arcane:sidebar-change', handleSidebarState);
    };
  }, []);

  const handleSidebarClose = () => {
    setSidebarOpen(false);
    // Notify AppRouter
    (window as any).__arcaneSidebarOpen = false;
    window.dispatchEvent(new CustomEvent('arcane:sidebar-close'));
  };

  return (
    <div class="chapter-page-container">
      <Sidebar
        project={project}
        selectedChapterId={chapterId}
        onSelectChapter={(id) => {
          handleSidebarClose(); // Close sidebar on mobile when selecting chapter
          route(`/projects/${projectId}/chapters/${id}`);
        }}
        onUploadChapter={async () => {}}
        onDeleteChapter={async (deletedChapterId) => {
          if (!project) return;
          try {
            await api.deleteChapter(project.id, deletedChapterId);
            invalidateProject(project.id);
            await handleRefreshProject();
            // If deleted chapter is currently viewed, navigate to project page
            if (deletedChapterId === chapterId) {
              route(`/projects/${projectId}`);
            }
          } catch (error) {
            console.error('Failed to delete chapter:', error);
            throw error; // Error will be handled by ChapterList component
          }
        }}
        onOpenGlossary={() => {
          handleSidebarClose(); // Close sidebar on mobile
          setShowGlossary(true);
        }}
        onProjectUpdate={(updatedProject) => {
          // Update project state directly with returned project
          setProject(updatedProject);
        }}
        onSettingsChange={handleSettingsChange}
        onRefreshProject={handleRefreshProject}
        isMobileOpen={sidebarOpen}
      />
      <section class="content">
        <ChapterView
          project={project}
          chapter={currentChapter}
          chapterIndex={chapterIndex}
          totalChapters={sortedChapters.length}
          onPrev={handlePrevChapter}
          onNext={handleNextChapter}
          onChapterUpdate={handleChapterUpdate}
          onEnterReadingMode={handleEnterReadingMode}
        />
      </section>

      {showGlossary && project && (
        <GlossaryModal
          isOpen={showGlossary}
          onClose={() => setShowGlossary(false)}
          projectId={project.id}
          entries={project.glossary}
          onUpdate={handleRefreshProject}
        />
      )}
    </div>
  );
}
