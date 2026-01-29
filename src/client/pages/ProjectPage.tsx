import { useEffect, useState, useRef } from 'preact/hooks';
import { route } from 'preact-router';
import { useSignal } from '@preact/signals';
import type { Project } from '../types';
import { getProject, invalidateProject } from '../store/projects';
import { ProjectInfo } from '../components/ProjectInfo';
import { Sidebar } from '../components/Sidebar';
import { GlossaryModal } from '../components/Glossary';
import { api } from '../api/client';
import type { ProjectSettings, Chapter } from '../types';

interface ProjectPageProps {
  projectId: string;
}

export function ProjectPage({ projectId }: ProjectPageProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTrigger = useSignal(0);
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

  const handleSettingsChange = (settings: ProjectSettings) => {
    if (!project) return;
    setProject({ ...project, settings });
  };

  const handleDeleteProject = () => {
    route('/');
  };

  const handleRefreshProject = async () => {
    if (!project) return;
    // Invalidate cache to force fresh data
    invalidateProject(project.id);
    // Load fresh project data from store (which will fetch from API)
    const updated = await getProject(project.id, true);
    if (updated) {
      setProject(updated);
      refreshTrigger.value += 1;
    }
  };

  const handleChapterUpdate = (chapter: Chapter) => {
    if (!project) return;
    setProject({
      ...project,
      chapters: project.chapters.map((c) => (c.id === chapter.id ? chapter : c)),
    });
  };

  const handleEnterReadingMode = () => {
    if (!project) return;
    // Navigate to reading mode for the first completed chapter, or first chapter if no completed
    const sortedChapters = [...project.chapters].sort((a, b) => a.number - b.number);
    const firstCompleted = sortedChapters.find(c => c.status === 'completed');
    const firstChapter = sortedChapters[0];
    const chapterId = (firstCompleted || firstChapter)?.id;
    if (chapterId) {
      route(`/projects/${projectId}/chapters/${chapterId}/reading`);
    }
  };

  if (loading) {
    return <div>Загрузка...</div>;
  }

  if (!project) {
    return <div>Проект не найден</div>;
  }

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
    <div class="project-page-container">
      <Sidebar
        project={project}
        selectedChapterId={null}
        onSelectChapter={(id) => {
          handleSidebarClose(); // Close sidebar on mobile when selecting chapter
          route(`/projects/${projectId}/chapters/${id}`);
        }}
        onUploadChapter={async (file, title) => {
          try {
            const result = await api.uploadChapter(project.id, file, title);
            // Handle both single chapter and multiple chapters response
            if ('chapters' in result && Array.isArray(result.chapters)) {
              // Multiple chapters uploaded (EPUB/FB2)
              if (result.warnings && result.warnings.length > 0) {
                // Warnings are handled by the upload component
              }
            }
            // Invalidate cache and refresh project immediately
            invalidateProject(project.id);
            await handleRefreshProject();
          } catch (error) {
            // Error is handled by ChapterList component
            throw error;
          }
        }}
        onOpenGlossary={() => {
          handleSidebarClose(); // Close sidebar on mobile
          setShowGlossary(true);
        }}
        onDeleteChapter={async (chapterId) => {
          if (!project) return;
          try {
            await api.deleteChapter(project.id, chapterId);
            invalidateProject(project.id);
            await handleRefreshProject();
          } catch (error) {
            console.error('Failed to delete chapter:', error);
            throw error; // Error will be handled by ChapterList component
          }
        }}
        onChaptersUpdate={handleRefreshProject}
        onProjectUpdate={(updatedProject) => {
          // Update project state directly with returned project
          setProject(updatedProject);
          refreshTrigger.value += 1;
        }}
        onSettingsChange={handleSettingsChange}
        onRefreshProject={handleRefreshProject}
        isMobileOpen={sidebarOpen}
      />
      <section class="content">
        <ProjectInfo
          project={project}
          onSettingsChange={handleSettingsChange}
          onDelete={handleDeleteProject}
          onRefreshProject={handleRefreshProject}
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
