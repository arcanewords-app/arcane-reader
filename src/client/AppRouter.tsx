import { Router } from 'preact-router';
import { useEffect, useState } from 'preact/hooks';
import type { SystemStatus, AuthUser } from './types';
import { authService } from './services/authService';
import { Header } from './components/Header';
import { AuthModal, EmailConfirmationModal } from './components/Auth';
import { api } from './api/client';
import { Dashboard } from './components/Dashboard';
import { ProjectPage } from './pages/ProjectPage';
import { ChapterPage } from './pages/ChapterPage';
import { ReadingModePage } from './pages/ReadingModePage';

type AppStatus = 'loading' | 'ready' | 'error';

// Main app component with routing
export function AppRouter() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);
  const [emailForConfirmation, setEmailForConfirmation] = useState('');
  const [status, setStatus] = useState<AppStatus>('loading');
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Sync sidebar state to window for pages to access
  useEffect(() => {
    (window as any).__arcaneSidebarOpen = sidebarOpen;
    window.dispatchEvent(new CustomEvent('arcane:sidebar-change'));
  }, [sidebarOpen]);

  // Listen for sidebar close events from pages
  useEffect(() => {
    const handleSidebarClose = () => {
      setSidebarOpen(false);
    };
    window.addEventListener('arcane:sidebar-close', handleSidebarClose);
    return () => {
      window.removeEventListener('arcane:sidebar-close', handleSidebarClose);
    };
  }, []);

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await authService.getCurrentUser();
        setIsAuthenticated(!!user);
        setAuthUser(user);
        
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
      setIsAuthenticated(false);
      setAuthUser(null);
      setShowAuthModal(true);
    };

    window.addEventListener('arcane:auth-error', handleAuthError);
    return () => {
      window.removeEventListener('arcane:auth-error', handleAuthError);
    };
  }, []);

  // Initialize system status
  useEffect(() => {
    api.getStatus()
      .then((data) => {
        setSystemStatus(data);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, []);

  // Handle window resize - close sidebar on desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setSidebarOpen(false);
      }
    };

    if (window.innerWidth > 768) {
      setSidebarOpen(false);
    }

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Auth handlers
  const handleLogin = (user: AuthUser) => {
    setAuthUser(user);
    setIsAuthenticated(true);
    setShowAuthModal(false);
  };

  const handleLogout = async () => {
    await authService.logout();
    setAuthUser(null);
    setIsAuthenticated(false);
    setShowAuthModal(true);
  };

  const handleEmailNotConfirmed = (email: string) => {
    setEmailForConfirmation(email);
    setShowEmailConfirmation(true);
  };

  const handleMenuToggle = () => {
    if (window.innerWidth <= 768) {
      setSidebarOpen((prev) => !prev);
    }
  };

  const handleSidebarClose = () => {
    setSidebarOpen(false);
  };

  // Determine if we're on dashboard (to hide sidebar)
  // Use window.location.pathname since useLocation is not available in preact-router
  const [isDashboard, setIsDashboard] = useState(
    typeof window !== 'undefined' && 
    (window.location.pathname === '/' || window.location.pathname === '')
  );

  // Update isDashboard when route changes
  useEffect(() => {
    const checkDashboard = () => {
      const newIsDashboard = window.location.pathname === '/' || window.location.pathname === '';
      setIsDashboard(newIsDashboard);
      // Close sidebar when navigating to dashboard
      if (newIsDashboard) {
        setSidebarOpen(false);
      }
    };

    // Check on popstate (back/forward navigation)
    window.addEventListener('popstate', checkDashboard);
    // Also check periodically for programmatic navigation
    const interval = setInterval(checkDashboard, 100);

    return () => {
      window.removeEventListener('popstate', checkDashboard);
      clearInterval(interval);
    };
  }, []);

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

  // If authenticated - show main app with routing
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
      {!isDashboard && (
        <div 
          class={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`}
          onClick={handleSidebarClose}
        />
      )}

      <main>
        <Router>
          <Dashboard path="/" />
          <ProjectPage path="/projects/:projectId" />
          <ChapterPage path="/projects/:projectId/chapters/:chapterId" />
          <ReadingModePage path="/projects/:projectId/chapters/:chapterId/reading" />
          <ReadingModePage path="/projects/:projectId/reading" />
        </Router>
      </main>
    </div>
  );
}
