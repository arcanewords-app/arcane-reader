import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import type { AuthUser } from '../types';
import { useUserRole } from '../hooks/useUserRole';
import { Button, Icon } from './ui';
import { TokenUsageIndicator } from './TokenUsage';
import { isTokenUsageRelevant } from '../utils/tokenUsagePaths';
import { setSavedLocale, type AppLocale } from '../i18n';
import './Header.css';

interface HeaderProps {
  user?: AuthUser | null;
  onLogout?: () => void;
  onMenuToggle?: () => void;
  /** Open auth modal on Login tab */
  onOpenLogin?: () => void;
  /** Open auth modal on Register tab */
  onOpenRegister?: () => void;
}

export function Header({ user, onLogout, onMenuToggle, onOpenLogin, onOpenRegister }: HeaderProps) {
  const { t, i18n } = useTranslation();
  const { isAtLeast } = useUserRole();
  const isAuthor = user ? isAtLeast('author') : false;
  const isAdmin = user ? isAtLeast('admin') : false;
  const [isMobile, setIsMobile] = useState(false);
  const [hasSidebar, setHasSidebar] = useState(false);
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [infoOpen, setInfoOpen] = useState(false);
  const [localeOpen, setLocaleOpen] = useState(false);
  const currentLocale = (i18n.language || 'ru') as AppLocale;

  const localeLabels: Record<AppLocale, string> = {
    ru: t('settings.appLanguageRu'),
    en: t('settings.appLanguageEn'),
    be: t('settings.appLanguageBe'),
  };

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

  return (
    <header>
      <div class="header-content">
        {/* Mobile menu button - только на мобильных */}
        {onMenuToggle && isMobile && hasSidebar && (
          <Button
            variant="secondary"
            size="sm"
            className="header-mobile-menu-btn"
            onClick={onMenuToggle}
            aria-label={t('header.menuAria')}
          >
            <Icon name="menu" />
          </Button>
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
          {/* Group 1: Tools - TokenUsage, More, Locale */}
          <div class="header-toolbar">
            {user && isTokenUsageRelevant(currentPath) && <TokenUsageIndicator />}

            {/* Info menu (About, Contact, Privacy, Terms) - grouped by category */}
            <div class="header-info-wrap">
              <Button
                variant="secondary"
                size="sm"
                className="header-info-btn"
                onClick={() => setInfoOpen((o) => !o)}
                onBlur={() => setTimeout(() => setInfoOpen(false), 150)}
                aria-expanded={infoOpen}
                aria-haspopup="true"
                aria-label={t('info.menu')}
                title={t('info.menu')}
              >
                <Icon name="info" size="sm" />
                <span class="header-info-label">{t('info.menu')}</span>
              </Button>
              {infoOpen && (
                <div class="header-info-dropdown" role="menu">
                  <div class="header-info-section">
                    <div class="header-info-section-title">{t('info.aboutProject')}</div>
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
                      href="/news"
                      onClick={(e) => {
                        e.preventDefault();
                        route('/news');
                        setInfoOpen(false);
                      }}
                      role="menuitem"
                    >
                      {t('info.news')}
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
                      href="/account-tiers"
                      onClick={(e) => {
                        e.preventDefault();
                        route('/account-tiers');
                        setInfoOpen(false);
                      }}
                      role="menuitem"
                    >
                      {t('info.accountTiers')}
                    </a>
                  </div>
                  <div class="header-info-divider" aria-hidden="true" />
                  <div class="header-info-section">
                    <div class="header-info-section-title">{t('info.legal')}</div>
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
                </div>
              )}
            </div>

            {/* Language Selector - compact dropdown */}
            <div class="header-locale-wrap">
              <Button
                variant="secondary"
                size="sm"
                className="header-locale-btn"
                onClick={() => setLocaleOpen((o) => !o)}
                onBlur={() => setTimeout(() => setLocaleOpen(false), 150)}
                aria-expanded={localeOpen}
                aria-haspopup="true"
                aria-label={localeLabels[currentLocale]}
                title={localeLabels[currentLocale]}
              >
                <Icon name="language" size="sm" />
                <span class="header-locale-code">{currentLocale.toUpperCase()}</span>
              </Button>
              {localeOpen && (
                <div class="header-locale-dropdown" role="menu">
                  {(['ru', 'en', 'be'] as AppLocale[]).map((locale) => (
                    <button
                      key={locale}
                      type="button"
                      role="menuitem"
                      class={`locale-dropdown-item ${currentLocale === locale ? 'active' : ''}`}
                      onClick={() => {
                        setSavedLocale(locale);
                        setLocaleOpen(false);
                      }}
                    >
                      {locale.toUpperCase()} — {localeLabels[locale]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Auth Buttons (guests only) */}
            {!user && (onOpenLogin || onOpenRegister) && (
              <div class="header-auth-buttons">
                <Button variant="secondary" size="sm" onClick={onOpenLogin}>
                  {t('header.login')}
                </Button>
                <Button variant="primary" size="sm" onClick={onOpenRegister ?? onOpenLogin}>
                  {t('header.register')}
                </Button>
              </div>
            )}
          </div>

          {/* Group 2: User block - Avatar, Logout (logged-in only) */}
          {user && (
            <div class="header-user-block">
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
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
