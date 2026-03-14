import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import type { SystemStatus, AuthUser } from '../types';
import { useUserRole } from '../hooks/useUserRole';
import { Button, Icon } from './ui';
import { TokenUsageIndicator } from './TokenUsage';
import { isTokenUsageRelevant } from '../utils/tokenUsagePaths';
import { setSavedLocale, type AppLocale } from '../i18n';
import './Header.css';

interface HeaderProps {
  status: 'loading' | 'ready' | 'error';
  systemStatus: SystemStatus | null;
  user?: AuthUser | null;
  onLogout?: () => void;
  onMenuToggle?: () => void;
  /** Open auth modal on Login tab */
  onOpenLogin?: () => void;
  /** Open auth modal on Register tab */
  onOpenRegister?: () => void;
}

export function Header({
  status,
  systemStatus,
  user,
  onLogout,
  onMenuToggle,
  onOpenLogin,
  onOpenRegister,
}: HeaderProps) {
  const { t, i18n } = useTranslation();
  const { isAtLeast } = useUserRole();
  const isAuthor = user ? isAtLeast('author') : false;
  const isAdmin = user ? isAtLeast('admin') : false;
  const [isMobile, setIsMobile] = useState(false);
  const [hasSidebar, setHasSidebar] = useState(false);
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [infoOpen, setInfoOpen] = useState(false);
  const currentLocale = (i18n.language || 'ru') as AppLocale;

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    const syncPath = (path: string) => {
      setCurrentPath(path);
      setHasSidebar(path.startsWith('/projects/'));
    };
    const checkPath = () => syncPath(window.location.pathname);
    const handleRouteChange = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: string }>).detail;
      syncPath(detail?.url || window.location.pathname);
    };

    checkMobile();
    checkPath();

    window.addEventListener('resize', checkMobile);
    window.addEventListener('popstate', checkPath);
    window.addEventListener('arcane:route-change', handleRouteChange);

    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('popstate', checkPath);
      window.removeEventListener('arcane:route-change', handleRouteChange);
    };
  }, []);

  const getInitials = (email: string) => {
    const part = email.split('@')[0];
    if (!part) return '?';
    const chars = part.replace(/[^a-zA-Zа-яА-ЯёЁ0-9]/g, '');
    return chars.slice(0, 2).toUpperCase() || '?';
  };

  const getStatusText = () => {
    if (status === 'loading') return t('header.statusChecking');
    if (status === 'error') return t('header.statusError');
    if (systemStatus?.ai.configured) return t('header.statusConnected');
    return t('header.statusApiNotConfigured');
  };

  return (
    <header>
      <div class="header-content">
        {/* Mobile menu button - только на мобильных */}
        {onMenuToggle && isMobile && hasSidebar && (
          <button class="mobile-menu-btn" onClick={onMenuToggle} aria-label={t('header.menuAria')}>
            <Icon name="menu" />
          </button>
        )}

        {/* Branding - Логотип и название */}
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            route('/');
          }}
          class="header-logo"
        >
          <img src="/arcane_icon.png" alt="Arcane" class="logo-icon-img" />
          <div class="logo-info">
            <div class="logo-text">ARCANE</div>
            <div class="logo-subtitle">{t('header.logoSubtitle')}</div>
          </div>
        </a>

        {/* Navigation - Основная навигация (только для авторизованных) */}
        {user && (
          <nav class="header-navigation" aria-label="Main navigation">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                route('/');
              }}
              class={`nav-link ${currentPath === '/' ? 'active' : ''}`}
              aria-current={currentPath === '/' ? 'page' : undefined}
            >
              {t('nav.catalog')}
            </a>
            {isAuthor && (
              <a
                href="/projects"
                onClick={(e) => {
                  e.preventDefault();
                  route('/projects');
                }}
                class={`nav-link ${currentPath === '/projects' ? 'active' : ''}`}
                aria-current={currentPath === '/projects' ? 'page' : undefined}
              >
                {t('nav.projects')}
              </a>
            )}
            {isAdmin && (
              <a
                href="/admin/entities"
                onClick={(e) => {
                  e.preventDefault();
                  route('/admin/entities');
                }}
                class={`nav-link ${currentPath === '/admin/entities' ? 'active' : ''}`}
                aria-current={currentPath === '/admin/entities' ? 'page' : undefined}
              >
                {t('nav.admin')}
              </a>
            )}
          </nav>
        )}

        {/* Spacer для выравнивания */}
        <div class="header-spacer" />

        {/* Right section - Системная информация и управление */}
        <div class="header-actions">
          {/* Token Usage - слева от info, чтобы не прыгал UI при переходе между страницами */}
          {user && isTokenUsageRelevant(currentPath) && <TokenUsageIndicator />}

          {/* More menu (About, Contact, Privacy, Terms) */}
          <div class="header-info-wrap">
            <button
              type="button"
              class="header-info-btn"
              onClick={() => setInfoOpen((o) => !o)}
              onBlur={() => setTimeout(() => setInfoOpen(false), 150)}
              aria-expanded={infoOpen}
              aria-haspopup="true"
              aria-label={t('info.menu')}
              title={t('info.menu')}
            >
              <span class="header-info-icon" aria-hidden="true">
                <Icon name="more_vert" />
              </span>
            </button>
            {infoOpen && (
              <div class="header-info-dropdown" role="menu">
                <a
                  href="/about"
                  onClick={(e) => {
                    e.preventDefault();
                    route('/about');
                    setInfoOpen(false);
                  }}
                  role="menuitem"
                >
                  {t('info.about')}
                </a>
                <a
                  href="/contact"
                  onClick={(e) => {
                    e.preventDefault();
                    route('/contact');
                    setInfoOpen(false);
                  }}
                  role="menuitem"
                >
                  {t('info.contact')}
                </a>
                <a
                  href="/privacy"
                  onClick={(e) => {
                    e.preventDefault();
                    route('/privacy');
                    setInfoOpen(false);
                  }}
                  role="menuitem"
                >
                  {t('info.privacy')}
                </a>
                <a
                  href="/terms"
                  onClick={(e) => {
                    e.preventDefault();
                    route('/terms');
                    setInfoOpen(false);
                  }}
                  role="menuitem"
                >
                  {t('info.terms')}
                </a>
              </div>
            )}
          </div>

          {user ? (
            <>
              {/* System Status */}
              <div class={`api-status ${status}`} title={getStatusText()}>
                <span class="status-dot"></span>
                <span class="status-text">{getStatusText()}</span>
              </div>

              {/* Language Selector */}
              <div class="header-locale">
                {(['ru', 'en', 'pl'] as AppLocale[]).map((locale) => (
                  <button
                    key={locale}
                    type="button"
                    class={`locale-btn ${currentLocale === locale ? 'active' : ''}`}
                    onClick={() => setSavedLocale(locale)}
                    title={
                      locale === 'ru'
                        ? t('settings.appLanguageRu')
                        : locale === 'en'
                          ? t('settings.appLanguageEn')
                          : t('settings.appLanguagePl')
                    }
                  >
                    {locale.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* User Menu - Avatar (click → profile) + Logout */}
              <div class="header-user-menu">
                <button
                  type="button"
                  class="header-avatar-btn"
                  onClick={() => route('/profile')}
                  title={t('profile.openProfile')}
                  aria-label={t('profile.openProfile')}
                >
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" class="header-avatar-img" />
                  ) : (
                    <span class="header-avatar-placeholder">{getInitials(user.email)}</span>
                  )}
                </button>
                <Button variant="secondary" onClick={onLogout} size="sm">
                  {t('header.logout')}
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Language Selector для неавторизованных */}
              <div class="header-locale">
                {(['ru', 'en', 'pl'] as AppLocale[]).map((locale) => (
                  <button
                    key={locale}
                    type="button"
                    class={`locale-btn ${currentLocale === locale ? 'active' : ''}`}
                    onClick={() => setSavedLocale(locale)}
                    title={
                      locale === 'ru'
                        ? t('settings.appLanguageRu')
                        : locale === 'en'
                          ? t('settings.appLanguageEn')
                          : t('settings.appLanguagePl')
                    }
                  >
                    {locale.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Auth Buttons */}
              {(onOpenLogin || onOpenRegister) && (
                <div class="header-auth-buttons">
                  <Button variant="secondary" size="sm" onClick={onOpenLogin}>
                    {t('header.login')}
                  </Button>
                  <Button variant="primary" size="sm" onClick={onOpenRegister ?? onOpenLogin}>
                    {t('header.register')}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
