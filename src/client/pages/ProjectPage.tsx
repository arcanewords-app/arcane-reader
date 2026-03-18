import { useCallback, useEffect, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { useSignal } from '@preact/signals';
import type { ProjectWithChapterList, ProjectSettings } from '../types';
import { getProject, invalidateProject } from '../store/projects';
import { trackEvent } from '../utils/analytics';
import { ProjectInfo } from '../components/ProjectInfo';
import { Sidebar } from '../components/Sidebar';
import { GlossaryModal } from '../components/Glossary';
import { ReportsModal } from '../components/Reports';
import { PageLoading } from '../components/ui';
import { api } from '../api/client';

interface ProjectPageProps {
  projectId: string;
}

export function ProjectPage({ projectId }: ProjectPageProps) {
  const { t } = useTranslation();
  const [project, setProject] = useState<ProjectWithChapterList | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTrigger = useSignal(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [reportsCount, setReportsCount] = useState(0);

  useEffect(() => {
    loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadProject is stable, avoid refetch loop
  }, [projectId]);

  useEffect(() => {
    const handleSidebarState = () => {
      const state = (window as { __arcaneSidebarOpen?: boolean }).__arcaneSidebarOpen;
      if (state !== undefined) {
        setSidebarOpen(state);
      }
    };
    handleSidebarState();
    window.addEventListener('arcane:sidebar-change', handleSidebarState);
    return () => window.removeEventListener('arcane:sidebar-change', handleSidebarState);
  }, []);

  const loadProject = async () => {
    setLoading(true);
    try {
      const loadedProject = await getProject(projectId);
      if (loadedProject) {
        trackEvent('view_item', { item_id: loadedProject.id });
        setProject(loadedProject);
        api
          .getProjectReportsCount(projectId)
          .then(({ count }) => setReportsCount(count))
          .catch(() => {});
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
    route('/projects');
  };

  const handleRefreshProject = useCallback(
    async () => {
      if (!project) return;
      invalidateProject(project.id);
      const updated = await getProject(project.id, true);
      if (updated) {
        setProject(updated);
        refreshTrigger.value += 1;
        api
          .getProjectReportsCount(project.id)
          .then(({ count }) => setReportsCount(count))
          .catch(() => {});
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- project?.id only, to avoid JobsPanel fetch cascade on every re-render
    [project?.id]
  );

  const handleEnterReadingMode = () => {
    if (!project) return;
    // Navigate to reading mode for the first translated chapter (completed or draft), or first chapter
    const sortedChapters = [...project.chapters].sort((a, b) => a.number - b.number);
    const firstCompleted = sortedChapters.find(
      (c) => c.status === 'completed' || c.status === 'draft'
    );
    const firstChapter = sortedChapters[0];
    const chapterId = (firstCompleted || firstChapter)?.id;
    if (chapterId) {
      route(`/projects/${projectId}/chapters/${chapterId}/reading`);
    }
  };

  if (loading) {
    return <PageLoading text={t('common.loading')} />;
  }

  if (!project) {
    return (
      <div class="page-loading">
        <p>{t('project.notFound')}</p>
        <button type="button" class="page-back-btn" onClick={() => route('/projects')}>
          {t('common.back')}
        </button>
      </div>
    );
  }

  const handleSidebarClose = () => {
    setSidebarOpen(false);
    (window as { __arcaneSidebarOpen?: boolean }).__arcaneSidebarOpen = false;
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
        onUploadChapter={async ({ file, title, signal, onProgress }) => {
          const result = await api.uploadChapter(project.id, file, title, signal, onProgress);
          if ('chapters' in result && Array.isArray(result.chapters) && result.warnings?.length) {
            // Warnings are handled by the upload component
          }
          await handleRefreshProject();
          return result;
        }}
        onOpenGlossary={() => {
          handleSidebarClose();
          setShowGlossary(true);
        }}
        reportsCount={reportsCount}
        onOpenReports={() => {
          handleSidebarClose();
          setShowReports(true);
        }}
        onDeleteChapter={async (chapterId) => {
          if (!project) return;
          try {
            await api.deleteChapter(project.id, chapterId);
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
          chapters={project.chapters.map((c) => ({ id: c.id, number: c.number, title: c.title }))}
          onNavigateToChapter={(chapterId) => {
            setShowGlossary(false);
            route(`/projects/${project.id}/chapters/${chapterId}`);
          }}
          onUpdate={handleRefreshProject}
        />
      )}

      {showReports && project && (
        <ReportsModal
          isOpen={showReports}
          onClose={() => setShowReports(false)}
          projectId={project.id}
          onReportsChange={() =>
            api
              .getProjectReportsCount(project.id)
              .then(({ count }) => setReportsCount(count))
              .catch(() => {})
          }
        />
      )}
    </div>
  );
}
