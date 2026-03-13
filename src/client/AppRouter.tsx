import { Router, route } from 'preact-router';
import { useEffect, useState } from 'preact/hooks';
import { useCookieConsent } from './contexts/CookieConsentContext';
import { CookieBanner } from './components/CookieBanner/CookieBanner';
import { initGA, setupRouteChangeListener, trackEvent, trackPageView } from './utils/analytics';

/** Legacy redirect: /cabinet → /projects */
function CabinetRedirect() {
  useEffect(() => {
    route('/projects');
    window.history.replaceState({}, '', '/projects');
  }, []);
  return null;
}
import { useTranslation } from 'react-i18next';
import type { SystemStatus, AuthUser } from './types';
import { authService } from './services/authService';
import { TokenUsageProvider } from './contexts/TokenUsageContext';
import { ServiceHealthProvider } from './contexts/ServiceHealthContext';
import { Header } from './components/Header';
import { ServiceStatusBanner } from './components/ServiceStatusBanner';
import { AuthModal, EmailConfirmationModal } from './components/Auth';
import { LoadingSpinner } from './components/ui';
import { api } from './api/client';
import { ProfilePage, ProjectsPage, CatalogPage } from './pages';
import { AuthorGate } from './components/Auth/AuthorGate';
import { AboutPage } from './pages/AboutPage';
import { ContactPage } from './pages/ContactPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';
import { ProjectPage } from './pages/ProjectPage';
import { ChapterPage } from './pages/ChapterPage';
import { ReadingModePage } from './pages/ReadingModePage';
import { PublicationPage } from './pages/PublicationPage';
import { PublicationReadingPage } from './pages/PublicationReadingPage';

type AppStatus = 'loading' | 'ready' | 'error';

// Main app component with routing
export function AppRouter() {
  const { t } = useTranslation();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);
  const [emailForConfirmation, setEmailForConfirmation] = useState('');
  const [status, setStatus] = useState<AppStatus>('loading');
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Сайдбар есть только на /projects/* — показываем overlay и гамбургер только там
  const [hasSidebar, setHasSidebar] = useState(
    typeof window !== 'undefined' && window.location.pathname.startsWith('/projects/')
  );

  // Sync sidebar state to window for pages to access
  useEffect(() => {
    (window as Window & { __arcaneSidebarOpen?: boolean }).__arcaneSidebarOpen = sidebarOpen;
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

  // Lock body scroll when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen && hasSidebar) {
      // Lock scroll
      document.body.style.overflow = 'hidden';
      // For iOS - also lock position (optional, try without first)
      // const scrollY = window.scrollY;
      // document.body.style.position = 'fixed';
      // document.body.style.top = `-${scrollY}px`;
      // document.body.style.width = '100%';

      return () => {
        // Restore scroll
        document.body.style.overflow = '';
        // if (document.body.style.position === 'fixed') {
        //   const scrollY = parseInt(document.body.style.top || '0', 10);
        //   document.body.style.position = '';
        //   document.body.style.top = '';
        //   document.body.style.width = '';
        //   window.scrollTo(0, Math.abs(scrollY));
        // }
      };
    }
  }, [sidebarOpen, hasSidebar]);

  // Check authentication on mount (do not auto-open modal for guests — they see public catalog)
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await authService.getCurrentUser();
        setIsAuthenticated(!!user);
        setAuthUser(user);
      } catch (error) {
        console.error('Auth check failed:', error);
        setIsAuthenticated(false);
      }
    };
    checkAuth();
  }, []);

  // Open AuthModal when URL has ?login=required (e.g. after redirect from /profile or /projects)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('login') === 'required') {
      setAuthModalMode('login');
      setShowAuthModal(true);
    }
  }, []);

  // Legacy: redirect /cabinet → /projects for backward compatibility (handled by route below)

  // Protected routes: redirect guest from /profile, /projects and /projects/* to /?login=required
  useEffect(() => {
    if (isAuthenticated !== false) return;
    const path = window.location.pathname;
    if (path === '/profile' || path === '/projects' || path.startsWith('/projects/')) {
      route('/');
      const url = new URL(window.location.href);
      url.pathname = '/';
      url.searchParams.set('login', 'required');
      window.history.replaceState({}, '', url.toString());
      setAuthModalMode('login');
      setShowAuthModal(true);
    }
  }, [isAuthenticated]);

  // Listen for authentication errors (401) from API client
  useEffect(() => {
    const handleAuthError = () => {
      setIsAuthenticated(false);
      setAuthUser(null);
      setAuthModalMode('login');
      setShowAuthModal(true);
    };

    window.addEventListener('arcane:auth-error', handleAuthError);
    return () => {
      window.removeEventListener('arcane:auth-error', handleAuthError);
    };
  }, []);

  // Initialize system status
  useEffect(() => {
    api
      .getStatus()
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
    const params = new URLSearchParams(window.location.search);
    if (params.get('login') === 'required') {
      window.history.replaceState({}, '', window.location.pathname || '/');
      route(window.location.pathname || '/');
    }
  };

  const handleLogout = async () => {
    trackEvent('logout');
    await authService.logout();
    setAuthUser(null);
    setIsAuthenticated(false);
    setShowAuthModal(false);
    route('/');
  };

  const handleOpenLogin = () => {
    setAuthModalMode('login');
    setShowAuthModal(true);
  };

  const handleOpenRegister = () => {
    setAuthModalMode('register');
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

  useEffect(() => {
    const checkPath = () => {
      const path = window.location.pathname;
      const newHasSidebar = path.startsWith('/projects/');
      setHasSidebar(newHasSidebar);
      if (!newHasSidebar) setSidebarOpen(false);
    };

    window.addEventListener('popstate', checkPath);
    const interval = setInterval(checkPath, 100);

    return () => {
      window.removeEventListener('popstate', checkPath);
      clearInterval(interval);
    };
  }, []);

  const { consent } = useCookieConsent();
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;

  // Initialize GA when user accepts analytics cookies
  useEffect(() => {
    if (consent !== 'accepted' || !measurementId) return;

    initGA(measurementId);
    trackPageView(window.location.pathname);

    const cleanup = setupRouteChangeListener();
    return cleanup;
  }, [consent, measurementId]);

  if (isAuthenticated === null) {
    return (
      <div
        class="app"
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <LoadingSpinner size="lg" text={t('common.loading')} />
      </div>
    );
  }

  // Always render app: public catalog on / for everyone; guests see Header with Login/Register
  return (
    <TokenUsageProvider>
      <ServiceHealthProvider>
        <div class="app">
          <AuthModal
            isOpen={showAuthModal}
            initialMode={authModalMode}
            onSuccess={handleLogin}
            onClose={() => setShowAuthModal(false)}
            onEmailNotConfirmed={handleEmailNotConfirmed}
          />
          {showEmailConfirmation && (
            <EmailConfirmationModal
              isOpen={showEmailConfirmation}
              email={emailForConfirmation}
              onClose={() => setShowEmailConfirmation(false)}
            />
          )}

          <Header
            status={status}
            systemStatus={systemStatus}
            user={authUser}
            onLogout={handleLogout}
            onMenuToggle={handleMenuToggle}
            onOpenLogin={handleOpenLogin}
            onOpenRegister={handleOpenRegister}
          />

          <ServiceStatusBanner />

          <CookieBanner />

          {/* Sidebar overlay for mobile — только на страницах с сайдбаром (/projects/*) */}
          {hasSidebar && (
            <div
              class={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`}
              role="button"
              tabIndex={0}
              aria-label="Close sidebar"
              onClick={handleSidebarClose}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSidebarClose();
                }
              }}
            />
          )}

          <main>
            <Router
              onChange={(e: { url: string }) => {
                if (e.url === '/cabinet' || e.url.startsWith('/cabinet/')) {
                  route('/projects');
                  window.history.replaceState({}, '', '/projects');
                  return;
                }
                window.dispatchEvent(
                  new CustomEvent('arcane:route-change', { detail: { url: e.url } })
                );
              }}
            >
              <CatalogPage path="/" />
              <CatalogPage path="/catalog" />
              <AboutPage path="/about" />
              <ContactPage path="/contact" />
              <PrivacyPage path="/privacy" />
              <TermsPage path="/terms" />
              <ProfilePage path="/profile" />
              <CabinetRedirect path="/cabinet" />
              <AuthorGate path="/projects" component={ProjectsPage} />
              <PublicationReadingPage path="/p/:publicationId/chapters/:chapterId/reading" />
              <PublicationPage path="/p/:publicationId" />
              <AuthorGate path="/projects/:projectId" component={ProjectPage} />
              <AuthorGate path="/projects/:projectId/chapters/:chapterId" component={ChapterPage} />
              <AuthorGate
                path="/projects/:projectId/chapters/:chapterId/reading"
                component={ReadingModePage}
              />
              <AuthorGate path="/projects/:projectId/reading" component={ReadingModePage} />
            </Router>
          </main>
        </div>
      </ServiceHealthProvider>
    </TokenUsageProvider>
  );
}
