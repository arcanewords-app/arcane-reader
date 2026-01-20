import { useEffect, useState, useCallback } from 'preact/hooks';
import { api, ApiError } from './api/client';
import type { SystemStatus, Project, Chapter, ProjectSettings, AuthUser } from './types';
import { authService } from './services/authService';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ProjectInfo } from './components/ProjectInfo';
import { ChapterView } from './components/ChapterView';
import { ReadingMode } from './components/ReadingMode';
import { GlossaryModal } from './components/Glossary';
import { AuthModal, EmailConfirmationModal } from './components/Auth';
import { Card, Button, Modal } from './components/ui';

type AppStatus = 'loading' | 'ready' | 'error';

export function App() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);
  const [emailForConfirmation, setEmailForConfirmation] = useState('');

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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Handle window resize and popstate - close sidebar on desktop
  useEffect(() => {
    let resizeTimeout: number | null = null;

    const handleResize = () => {
      // Debounce resize events
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      
      resizeTimeout = window.setTimeout(() => {
        // Close sidebar if window width is greater than 768px (desktop)
        if (window.innerWidth > 768) {
          setSidebarOpen(false);
        }
      }, 100);
    };

    const handlePopState = () => {
      // Close sidebar when navigating back/forward
      setSidebarOpen(false);
    };

    const handleVisibilityChange = () => {
      // Close sidebar when tab becomes visible (handles DevTools switching)
      if (document.visibilityState === 'visible' && window.innerWidth > 768) {
        setSidebarOpen(false);
      }
    };

    // Check on mount
    if (window.innerWidth > 768) {
      setSidebarOpen(false);
    }

    // Listen for resize events
    window.addEventListener('resize', handleResize);
    // Listen for browser back/forward navigation
    window.addEventListener('popstate', handlePopState);
    // Listen for visibility changes (handles DevTools switching)
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await authService.getCurrentUser();
        setIsAuthenticated(!!user);
        setAuthUser(user);
        
        // If not authenticated, show auth modal
        if (!user) {
          setShowAuthModal(true);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setIsAuthenticated(false);
        setShowAuthModal(true);
      }
    };
    
    checkAuth();
  }, []);

  // Listen for authentication errors (401) from API client
  useEffect(() => {
    const handleAuthError = () => {
      // Update auth state to show login
      setIsAuthenticated(false);
      setAuthUser(null);
      setShowAuthModal(true);
      
      // Update URL to include login=required parameter if not already there
      const url = new URL(window.location.href);
      if (!url.searchParams.has('login')) {
        url.searchParams.set('login', 'required');
        window.history.replaceState({}, '', url.toString());
      }
    };

    window.addEventListener('arcane:auth-error', handleAuthError);
    return () => {
      window.removeEventListener('arcane:auth-error', handleAuthError);
    };
  }, []);

  // Read URL parameters on mount (only once)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get('project');
    const chapterId = params.get('chapter');
    const reading = params.get('reading') === 'true';
    const loginRequired = params.get('login') === 'required';

    // If login required, show auth modal
    if (loginRequired) {
      setShowAuthModal(true);
    }

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
        // Ignore 401 errors - they are handled globally and will show login page
        if (error instanceof ApiError && error.status === 401) {
          // Auth error - handled globally, just clear project
          setProject(null);
          return;
        }
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

  // Auth handlers
  const handleLogin = useCallback((user: AuthUser) => {
    setAuthUser(user);
    setIsAuthenticated(true);
    setShowAuthModal(false);
  }, []);

  const handleLogout = useCallback(async () => {
    await authService.logout();
    setAuthUser(null);
    setIsAuthenticated(false);
    setShowAuthModal(true);
  }, []);

  const handleEmailNotConfirmed = useCallback((email: string) => {
    setEmailForConfirmation(email);
    setShowEmailConfirmation(true);
  }, []);

  const handleRefreshProject = useCallback(async () => {
    if (!project) return;
    const updated = await api.getProject(project.id);
    setProject(updated);
  }, [project]);

  const handlePrevChapter = useCallback(() => {
    if (!project || !selectedChapterId) return;
    // Sort chapters by number for navigation
    const sortedChapters = [...project.chapters].sort((a, b) => a.number - b.number);
    const idx = sortedChapters.findIndex((c) => c.id === selectedChapterId);
    if (idx > 0) {
      setSelectedChapterId(sortedChapters[idx - 1].id);
    }
  }, [project, selectedChapterId]);

  const handleNextChapter = useCallback(() => {
    if (!project || !selectedChapterId) return;
    // Sort chapters by number for navigation
    const sortedChapters = [...project.chapters].sort((a, b) => a.number - b.number);
    const idx = sortedChapters.findIndex((c) => c.id === selectedChapterId);
    if (idx < sortedChapters.length - 1) {
      setSelectedChapterId(sortedChapters[idx + 1].id);
    }
  }, [project, selectedChapterId]);

  // Get current chapter and index (sorted by number)
  const sortedChapters = project ? [...project.chapters].sort((a, b) => a.number - b.number) : [];
  const currentChapter = sortedChapters.find((c) => c.id === selectedChapterId);
  const chapterIndex = sortedChapters.findIndex((c) => c.id === selectedChapterId);

  // If auth check is still in progress - show loader
  if (isAuthenticated === null) {
    return (
      <div class="app" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div>Загрузка...</div>
      </div>
    );
  }

  // If not authenticated - show auth modal
  if (!isAuthenticated) {
    return (
      <div class="app">
        <AuthModal 
          isOpen={showAuthModal} 
          onSuccess={handleLogin}
          onEmailNotConfirmed={handleEmailNotConfirmed}
        />
        {showEmailConfirmation && (
          <EmailConfirmationModal
            isOpen={showEmailConfirmation}
            email={emailForConfirmation}
            onClose={() => setShowEmailConfirmation(false)}
          />
        )}
      </div>
    );
  }

  // If authenticated - show main app
  const handleMenuToggle = useCallback(() => {
    // Only allow toggle on mobile (width <= 768px)
    if (window.innerWidth <= 768) {
      setSidebarOpen((prev) => !prev);
    }
  }, []);

  const handleSidebarClose = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const handleSelectProjectWithClose = useCallback((id: string) => {
    handleSelectProject(id);
    setSidebarOpen(false);
  }, [handleSelectProject]);

  const handleSelectChapterWithClose = useCallback((id: string) => {
    handleSelectChapter(id);
    setSidebarOpen(false);
  }, [handleSelectChapter]);

  return (
    <div class="app">
      <Header 
        status={status} 
        systemStatus={systemStatus} 
        user={authUser} 
        onLogout={handleLogout}
        onMenuToggle={handleMenuToggle}
      />

      {/* Sidebar overlay for mobile */}
      <div 
        class={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`}
        onClick={handleSidebarClose}
      />

      <main>
        <Sidebar
          project={project}
          selectedProjectId={selectedProjectId}
          selectedChapterId={selectedChapterId}
          onSelectProject={handleSelectProjectWithClose}
          onSelectChapter={handleSelectChapterWithClose}
          onDeleteChapter={handleDeleteChapter}
          onUploadChapter={handleUploadChapter}
          onOpenGlossary={() => {
            setShowGlossary(true);
            setSidebarOpen(false);
          }}
          onProjectCreated={handleRefreshProject}
          onChaptersUpdate={handleRefreshProject}
          refreshTrigger={refreshTrigger}
          isMobileOpen={sidebarOpen}
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
              totalChapters={sortedChapters.length}
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
