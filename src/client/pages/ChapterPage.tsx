import { useEffect, useState, useRef } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import type { ProjectWithChapterList, Chapter, ProjectSettings } from '../types';
import { getProject, invalidateProject } from '../store/projects';
import { ChapterView } from '../components/ChapterView';
import { Sidebar } from '../components/Sidebar';
import { GlossaryModal } from '../components/Glossary';
import { LoadingSpinner } from '../components/ui';
import { api } from '../api/client';

interface ChapterPageProps {
  projectId: string;
  chapterId: string;
}

export function ChapterPage({ projectId, chapterId }: ChapterPageProps) {
  const { t } = useTranslation();
  const [project, setProject] = useState<ProjectWithChapterList | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const prevProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    const projectIdChanged = prevProjectIdRef.current !== projectId;
    prevProjectIdRef.current = projectId;

    if (projectIdChanged || !project) {
      loadProject();
      return;
    }

    if (chapterId) {
      loadChapterOnly(chapterId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadProject/loadChapterOnly use projectId/chapterId
  }, [projectId, chapterId]);

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
    if (chapterId) setChapter(null);
    try {
      const loadedProject = await getProject(projectId);
      if (!loadedProject) {
        route('/');
        return;
      }
      setProject(loadedProject);
      setLoading(false);

      if (chapterId) {
        const loadedChapter = await api.getChapter(projectId, chapterId);
        setChapter(loadedChapter);
      }
    } catch (error) {
      console.error('Failed to load project:', error);
      route('/');
    } finally {
      setLoading(false);
    }
  };

  const loadChapterOnly = async (cid: string) => {
    setChapter(null);
    try {
      const loadedChapter = await api.getChapter(projectId, cid);
      setChapter(loadedChapter);
    } catch (error) {
      console.error('Failed to load chapter:', error);
    }
  };

  const handleChapterUpdate = (updatedChapter: Chapter) => {
    if (!project) return;
    setChapter(updatedChapter);
    setProject({
      ...project,
      chapters: project.chapters.map((c) =>
        c.id === updatedChapter.id
          ? {
              ...c,
              status: updatedChapter.status,
              hasTranslation:
                updatedChapter.status === 'completed' ||
                updatedChapter.status === 'draft' ||
                (updatedChapter.paragraphs?.some(
                  (p) => p.translatedText && p.translatedText.trim().length > 0
                ) ??
                  false),
            }
          : c
      ),
    });
  };

  const handleSettingsChange = (settings: ProjectSettings) => {
    if (!project) return;
    setProject({ ...project, settings });
  };

  const handleRefreshProject = async () => {
    if (!project) return;
    invalidateProject(project.id);
    const updated = await getProject(project.id, true);
    if (updated) {
      setProject(updated);
    }
  };

  const handleEnterReadingMode = () => {
    route(`/projects/${projectId}/chapters/${chapterId}/reading`);
  };

  // Full-page loading only when loading project or project not yet loaded.
  // When switching chapters (loadChapterOnly), project exists — show ChapterView with skeleton.
  const isLoadingPage = loading || !project;
  if (isLoadingPage) {
    return (
      <div class="page-loading">
        <LoadingSpinner size="lg" text={t('common.loading')} />
      </div>
    );
  }

  const sortedChapters = [...project.chapters].sort((a, b) => a.number - b.number);
  const chapterListItem = sortedChapters.find((c) => c.id === chapterId);
  const chapterIndex = sortedChapters.findIndex((c) => c.id === chapterId);

  if (!chapterListItem) {
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

  const handleSidebarClose = () => {
    setSidebarOpen(false);
    (window as { __arcaneSidebarOpen?: boolean }).__arcaneSidebarOpen = false;
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
        onUploadChapter={async ({ file, title, signal, onProgress }) => {
          const result = await api.uploadChapter(project.id, file, title, signal, onProgress);
          await handleRefreshProject();
          return result;
        }}
        onDeleteChapter={async (deletedChapterId) => {
          if (!project) return;
          try {
            await api.deleteChapter(project.id, deletedChapterId);
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
        onChaptersUpdate={handleRefreshProject}
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
          chapter={chapter}
          chapterListItem={chapterListItem}
          chapterIndex={chapterIndex}
          totalChapters={sortedChapters.length}
          onPrev={handlePrevChapter}
          onNext={handleNextChapter}
          onChapterUpdate={handleChapterUpdate}
          onEnterReadingMode={handleEnterReadingMode}
          onSettingsChange={handleSettingsChange}
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
    </div>
  );
}
