import { useEffect, useState, useCallback } from 'preact/hooks';
import { api } from './api/client';
import type { SystemStatus, Project, Chapter, ProjectSettings } from './types';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ProjectInfo } from './components/ProjectInfo';
import { ChapterView } from './components/ChapterView';
import { ReadingMode } from './components/ReadingMode';
import { GlossaryModal } from './components/Glossary';
import { Card, Button, Modal } from './components/ui';

type AppStatus = 'loading' | 'ready' | 'error';

export function App() {
  // System state
  const [status, setStatus] = useState<AppStatus>('loading');
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);

  // Project state
  const [project, setProject] = useState<Project | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);

  // UI state
  const [showGlossary, setShowGlossary] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [deleteChapterId, setDeleteChapterId] = useState<string | null>(null);
  const [deletingChapter, setDeletingChapter] = useState(false);
  const [readingMode, setReadingMode] = useState(false);

  // Read URL parameters on mount (only once)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get('project');
    const chapterId = params.get('chapter');
    const reading = params.get('reading') === 'true';

    if (projectId) {
      setSelectedProjectId(projectId);
      if (chapterId) {
        setSelectedChapterId(chapterId);
      }
      if (reading) {
        setReadingMode(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Update URL when state changes
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedProjectId) {
      params.set('project', selectedProjectId);
      if (selectedChapterId) {
        params.set('chapter', selectedChapterId);
      }
      if (readingMode) {
        params.set('reading', 'true');
      }
    }

    const newUrl = params.toString() 
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    
    // Use replaceState to avoid adding history entries on every change
    window.history.replaceState({}, '', newUrl);
  }, [selectedProjectId, selectedChapterId, readingMode]);

  // Initialize
  useEffect(() => {
    api.getStatus()
      .then((data) => {
        setSystemStatus(data);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, []);

  // Load project when selected
  useEffect(() => {
    if (!selectedProjectId) {
      setProject(null);
      setSelectedChapterId(null);
      // Don't reset reading mode here - it will be reset by URL update effect
      return;
    }

    api.getProject(selectedProjectId)
      .then(setProject)
      .catch((error) => {
        console.error('Failed to load project:', error);
        setProject(null);
      });
  }, [selectedProjectId]);

  // Handlers
  const handleSelectProject = useCallback((id: string) => {
    setSelectedProjectId(id);
    setSelectedChapterId(null);
  }, []);

  const handleSelectChapter = useCallback((id: string) => {
    setSelectedChapterId(id);
  }, []);

  const handleDeleteChapter = useCallback((id: string) => {
    setDeleteChapterId(id);
  }, []);

  const confirmDeleteChapter = useCallback(async () => {
    if (!project || !deleteChapterId) return;
    setDeletingChapter(true);
    try {
      await api.deleteChapter(project.id, deleteChapterId);
      const updated = await api.getProject(project.id);
      setProject(updated);
      setRefreshTrigger((n) => n + 1);
      if (selectedChapterId === deleteChapterId) {
        setSelectedChapterId(null);
      }
      setDeleteChapterId(null);
    } finally {
      setDeletingChapter(false);
    }
  }, [project, deleteChapterId, selectedChapterId]);

  const handleUploadChapter = useCallback(async (file: File, title: string) => {
    if (!project) return;
    await api.uploadChapter(project.id, file, title);
    const updated = await api.getProject(project.id);
    setProject(updated);
    setRefreshTrigger((n) => n + 1); // Update project list
  }, [project]);

  const handleSettingsChange = useCallback((settings: ProjectSettings) => {
    if (!project) return;
    setProject({ ...project, settings });
  }, [project]);

  const handleDeleteProject = useCallback(() => {
    setSelectedProjectId(null);
    setProject(null);
  }, []);

  const handleChapterUpdate = useCallback((chapter: Chapter) => {
    if (!project) return;
    setProject({
      ...project,
      chapters: project.chapters.map((c) => (c.id === chapter.id ? chapter : c)),
    });
  }, [project]);

  const handleRefreshProject = useCallback(async () => {
    if (!project) return;
    const updated = await api.getProject(project.id);
    setProject(updated);
  }, [project]);

  const handlePrevChapter = useCallback(() => {
    if (!project || !selectedChapterId) return;
    const idx = project.chapters.findIndex((c) => c.id === selectedChapterId);
    if (idx > 0) {
      setSelectedChapterId(project.chapters[idx - 1].id);
    }
  }, [project, selectedChapterId]);

  const handleNextChapter = useCallback(() => {
    if (!project || !selectedChapterId) return;
    const idx = project.chapters.findIndex((c) => c.id === selectedChapterId);
    if (idx < project.chapters.length - 1) {
      setSelectedChapterId(project.chapters[idx + 1].id);
    }
  }, [project, selectedChapterId]);

  // Get current chapter
  const currentChapter = project?.chapters.find((c) => c.id === selectedChapterId);
  const chapterIndex = project?.chapters.findIndex((c) => c.id === selectedChapterId) ?? -1;

  return (
    <div class="app">
      <Header status={status} systemStatus={systemStatus} />

      <main>
        <Sidebar
          project={project}
          selectedProjectId={selectedProjectId}
          selectedChapterId={selectedChapterId}
          onSelectProject={handleSelectProject}
          onSelectChapter={handleSelectChapter}
          onDeleteChapter={handleDeleteChapter}
          onUploadChapter={handleUploadChapter}
          onOpenGlossary={() => setShowGlossary(true)}
          onProjectCreated={handleRefreshProject}
          refreshTrigger={refreshTrigger}
        />

        <section class="content">
          {/* Alert for missing API key */}
          {systemStatus && !systemStatus.ai.configured && (
            <div class="alert-banner visible">
              <div class="alert-icon">⚠️</div>
              <div class="alert-content">
                <h4>API ключ не настроен</h4>
                <p>
                  Для перевода добавьте <code>OPENAI_API_KEY</code> в файл{' '}
                  <code>.env</code>
                </p>
              </div>
            </div>
          )}

          {/* Welcome screen */}
          {!project && (
            <Card className="welcome">
              <img src="/arcane_icon.png" alt="Arcane" class="welcome-logo" />
              <h2>Добро пожаловать в Arcane</h2>
              <p>
                Интеллектуальный переводчик новелл с английского на русский с
                сохранением контекста и стилистики.
              </p>
              <Button
                style={{ marginTop: '2rem' }}
                onClick={() => {
                  // This will be handled by ProjectList modal
                  const btn = document.querySelector('.btn-primary.btn-full') as HTMLButtonElement;
                  btn?.click();
                }}
              >
                Создать первый проект
              </Button>
            </Card>
          )}

          {/* Reading Mode */}
          {project && readingMode && (
            <ReadingMode
              project={project}
              initialChapterId={selectedChapterId || undefined}
              onExit={() => setReadingMode(false)}
            />
          )}

          {/* Project info */}
          {project && !currentChapter && !readingMode && (
            <ProjectInfo
              project={project}
              onSettingsChange={handleSettingsChange}
              onDelete={handleDeleteProject}
              onRefreshProject={handleRefreshProject}
              onEnterReadingMode={() => setReadingMode(true)}
            />
          )}

          {/* Chapter view */}
          {project && currentChapter && !readingMode && (
            <ChapterView
              project={project}
              chapter={currentChapter}
              chapterIndex={chapterIndex}
              totalChapters={project.chapters.length}
              onPrev={handlePrevChapter}
              onNext={handleNextChapter}
              onChapterUpdate={handleChapterUpdate}
              onEnterReadingMode={() => setReadingMode(true)}
            />
          )}
        </section>
      </main>

      {/* Glossary Modal */}
      {project && (
        <GlossaryModal
          isOpen={showGlossary}
          onClose={() => setShowGlossary(false)}
          projectId={project.id}
          entries={project.glossary}
          onUpdate={handleRefreshProject}
        />
      )}

      {/* Delete Chapter Confirm Modal */}
      <Modal
        isOpen={deleteChapterId !== null}
        onClose={() => setDeleteChapterId(null)}
        title="🗑️ Удалить главу?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteChapterId(null)}>
              Отмена
            </Button>
            <Button onClick={confirmDeleteChapter} loading={deletingChapter}>
              Удалить
            </Button>
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)' }}>
          Вы уверены, что хотите удалить главу{' '}
          <strong>
            "{project?.chapters.find((c) => c.id === deleteChapterId)?.title}"
          </strong>
          ? Это действие нельзя отменить.
        </p>
      </Modal>
    </div>
  );
}
