import { Router, route } from 'preact-router';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { useCookieConsent } from './contexts/CookieConsentContext';
import { CookieBanner } from './components/CookieBanner/CookieBanner';
import {
  initGA,
  initWebVitals,
  setupRouteChangeListener,
  trackEvent,
  trackPageView,
} from './utils/analytics';

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
import {
  AUTH_CHANGED_EVENT,
  OPEN_AUTH_EVENT,
  authService,
  consumePostAuthRedirect,
  type OpenAuthDetail,
} from './services/authService';
import { TokenUsageProvider } from './contexts/TokenUsageContext';
import { ServiceHealthProvider } from './contexts/ServiceHealthContext';
import { AnnouncementProvider } from './contexts/AnnouncementContext';
import { SystemStatusProvider } from './contexts/SystemStatusContext';
import { Header } from './components/Header';
import { ServiceStatusBanner } from './components/ServiceStatusBanner';
import { AnnouncementBanner } from './components/AnnouncementBanner';
import { AuthModal, EmailConfirmationModal } from './components/Auth';
import { LoadingSpinner } from './components/ui';
import { api } from './api/client';
import { isMobileViewport } from './utils/viewport';
import { ProfilePage, ProjectsPage, CatalogPage, AdminEntitiesPage } from './pages';
import { AuthorGate } from './components/Auth/AuthorGate';
import { AdminGate } from './components/Auth/AdminGate';
import { AboutPage } from './pages/AboutPage';
import { NewsPage } from './pages/NewsPage';
import { NewsDetailPage } from './pages/NewsDetailPage';
import { AdminNewsPage } from './pages/AdminNewsPage';
import { AdminPublicationsPage } from './pages/AdminPublicationsPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { TranslationRequestsPage } from './pages/TranslationRequestsPage';
import { AdminRedirect, AdminEntitiesRedirect } from './pages/AdminRedirect';
import { AccountTiersPage } from './pages/AccountTiersPage';
import { ContactPage } from './pages/ContactPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';
import { ProjectPage } from './pages/ProjectPage';
import { ChapterPage } from './pages/ChapterPage';
import { ReadingModePage } from './pages/ReadingModePage';
import { PublicationPage } from './pages/PublicationPage';
import { PublicationReadingPage } from './pages/PublicationReadingPage';

// Main app component with routing
export function AppRouter() {
  const { t } = useTranslation();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);
  const [emailForConfirmation, setEmailForConfirmation] = useState('');
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Сайдбар есть только на /projects/* — показываем overlay и гамбургер только там
  const [hasSidebar, setHasSidebar] = useState(
    typeof window !== 'undefined' && window.location.pathname.startsWith('/projects/')
  );

  const syncAuthState = useCallback(async () => {
    try {
      const user = await authService.getCurrentUser();
      setIsAuthenticated(!!user);
      setAuthUser(user);
    } catch (error) {
      console.error('Auth sync failed:', error);
      setIsAuthenticated(false);
      setAuthUser(null);
    }
  }, []);

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
    syncAuthState();
  }, [syncAuthState]);

  // Open AuthModal when URL has ?login=required (e.g. after redirect from /profile or /projects)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('login') === 'required') {
      setAuthModalMode('login');
      setShowAuthModal(true);
    }
  }, []);

  // Legacy: redirect /cabinet → /projects for backward compatibility (handled by route below)

  // Protected routes: redirect guest from /profile, /projects(/...), /admin(/...) to /?login=required
  useEffect(() => {
    if (isAuthenticated !== false) return;
    const path = window.location.pathname;
    if (
      path === '/profile' ||
      path === '/translation-requests' ||
      path === '/projects' ||
      path.startsWith('/projects/') ||
      path === '/admin/entities' ||
      path.startsWith('/admin/')
    ) {
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

  // Open AuthModal from feature prompts (e.g. suggest translation on catalog)
  useEffect(() => {
    const handleOpenAuth = (e: CustomEvent<OpenAuthDetail>) => {
      const mode = e.detail?.mode === 'register' ? 'register' : 'login';
      setAuthModalMode(mode);
      setShowAuthModal(true);
    };

    window.addEventListener(OPEN_AUTH_EVENT, handleOpenAuth as EventListener);
    return () => {
      window.removeEventListener(OPEN_AUTH_EVENT, handleOpenAuth as EventListener);
    };
  }, []);

  // Keep auth state in sync after login/logout/refresh and across browser tabs.
  useEffect(() => {
    const handleAuthChanged = (
      e: CustomEvent<{ authenticated: boolean; user: AuthUser | null }>
    ) => {
      setIsAuthenticated(e.detail.authenticated);
      setAuthUser(e.detail.user);
    };
    const handleStorage = (e: StorageEvent) => {
      if (!e.key || (!e.key.startsWith('arcane_auth_') && e.key !== 'arcane_user')) return;
      syncAuthState();
    };
    const handleFocus = () => {
      syncAuthState();
    };
    const handleVisibility = () => {
      if (!document.hidden) syncAuthState();
    };

    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChanged as EventListener);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChanged as EventListener);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [syncAuthState]);

  // Initialize system status (for maxFileSize, etc.)
  useEffect(() => {
    api
      .getStatus()
      .then((data) => setSystemStatus(data))
      .catch(() => setSystemStatus(null));
  }, []);

  // Handle window resize - close drawer sidebar when leaving mobile
  useEffect(() => {
    const handleResize = () => {
      if (!isMobileViewport()) {
        setSidebarOpen(false);
      }
    };

    if (!isMobileViewport()) {
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
    const postAuthRedirect = consumePostAuthRedirect();
    if (postAuthRedirect) {
      route(postAuthRedirect);
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
    if (isMobileViewport()) {
      setSidebarOpen((prev) => !prev);
    }
  };

  const handleSidebarClose = () => {
    setSidebarOpen(false);
  };

  useEffect(() => {
    const syncByPath = (path: string) => {
      const newHasSidebar = path.startsWith('/projects/');
      setHasSidebar(newHasSidebar);
      if (!newHasSidebar) setSidebarOpen(false);
    };
    const checkPath = () => syncByPath(window.location.pathname);
    const handleRouteChange = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: string }>).detail;
      syncByPath(detail?.url || window.location.pathname);
    };

    window.addEventListener('popstate', checkPath);
    window.addEventListener('arcane:route-change', handleRouteChange);
    checkPath();

    return () => {
      window.removeEventListener('popstate', checkPath);
      window.removeEventListener('arcane:route-change', handleRouteChange);
    };
  }, []);

  const { consent } = useCookieConsent();
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;

  // Initialize GA when user accepts analytics cookies
  useEffect(() => {
    if (consent !== 'accepted' || !measurementId) return;

    initGA(measurementId);
    trackPageView(window.location.pathname);
    initWebVitals();

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
        <AnnouncementProvider>
          <SystemStatusProvider value={systemStatus}>
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
                user={authUser}
                onLogout={handleLogout}
                onMenuToggle={handleMenuToggle}
                onOpenLogin={handleOpenLogin}
                onOpenRegister={handleOpenRegister}
              />

              <ServiceStatusBanner />

              <AnnouncementBanner />

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

              <main class={hasSidebar ? 'main-with-sidebar' : ''}>
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
                  <NewsPage path="/news" />
                  <NewsDetailPage path="/news/:slugOrId" />
                  <AccountTiersPage path="/account-tiers" />
                  <ContactPage path="/contact" />
                  <PrivacyPage path="/privacy" />
                  <TermsPage path="/terms" />
                  <ProfilePage path="/profile" />
                  <AuthorGate path="/translation-requests" component={TranslationRequestsPage} />
                  <CabinetRedirect path="/cabinet" />
                  <PublicationReadingPage path="/p/:publicationId/chapters/:chapterId/reading" />
                  <PublicationPage path="/p/:publicationId" />
                  <AdminGate path="/admin" component={AdminRedirect} />
                  <AdminGate path="/admin/entities" component={AdminEntitiesRedirect} />
                  <AdminGate path="/admin/entities/:kind" component={AdminEntitiesPage} />
                  <AdminGate path="/admin/news" component={AdminNewsPage} />
                  <AdminGate path="/admin/publications" component={AdminPublicationsPage} />
                  <AdminGate path="/admin/users" component={AdminUsersPage} />
                  {/* More specific /projects/* routes first — preact-router uses first-match */}
                  <AuthorGate
                    path="/projects/:projectId/chapters/:chapterId/reading"
                    component={ReadingModePage}
                  />
                  <AuthorGate
                    path="/projects/:projectId/chapters/:chapterId"
                    component={ChapterPage}
                  />
                  <AuthorGate path="/projects/:projectId/reading" component={ReadingModePage} />
                  <AuthorGate path="/projects/:projectId" component={ProjectPage} />
                  <AuthorGate path="/projects" component={ProjectsPage} />
                </Router>
              </main>
            </div>
          </SystemStatusProvider>
        </AnnouncementProvider>
      </ServiceHealthProvider>
    </TokenUsageProvider>
  );
}
