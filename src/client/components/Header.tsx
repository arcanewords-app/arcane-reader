import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import type { SystemStatus, AuthUser } from '../types';
import { Button } from './ui';
import { TokenUsageIndicator } from './TokenUsage';
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
  const [isMobile, setIsMobile] = useState(false);
  const [hasSidebar, setHasSidebar] = useState(false);
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [infoOpen, setInfoOpen] = useState(false);
  const currentLocale = (i18n.language || 'ru') as AppLocale;

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    const checkPath = () => {
      const path = window.location.pathname;
      setCurrentPath(path);
      setHasSidebar(path.startsWith('/projects/'));
    };

    checkMobile();
    checkPath();

    window.addEventListener('resize', checkMobile);
    window.addEventListener('popstate', checkPath);
    const interval = setInterval(checkPath, 100);

    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('popstate', checkPath);
      clearInterval(interval);
    };
  }, []);

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
            ☰
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
              {t('cabinet.catalog')}
            </a>
            <a
              href="/cabinet"
              onClick={(e) => {
                e.preventDefault();
                route('/cabinet');
              }}
              class={`nav-link ${currentPath === '/cabinet' ? 'active' : ''}`}
              aria-current={currentPath === '/cabinet' ? 'page' : undefined}
            >
              {t('cabinet.link')}
            </a>
          </nav>
        )}

        {/* Spacer для выравнивания */}
        <div class="header-spacer" />

        {/* Right section - Системная информация и управление */}
        <div class="header-actions">
          {/* More menu (About, Contact, Privacy, Terms) - рядом с языком */}
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
              <span class="header-info-icon" aria-hidden="true">⋮</span>
            </button>
            {infoOpen && (
              <div class="header-info-dropdown" role="menu">
                <a href="/about" onClick={(e) => { e.preventDefault(); route('/about'); setInfoOpen(false); }} role="menuitem">
                  {t('info.about')}
                </a>
                <a href="/contact" onClick={(e) => { e.preventDefault(); route('/contact'); setInfoOpen(false); }} role="menuitem">
                  {t('info.contact')}
                </a>
                <a href="/privacy" onClick={(e) => { e.preventDefault(); route('/privacy'); setInfoOpen(false); }} role="menuitem">
                  {t('info.privacy')}
                </a>
                <a href="/terms" onClick={(e) => { e.preventDefault(); route('/terms'); setInfoOpen(false); }} role="menuitem">
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

              {/* Token Usage */}
              <TokenUsageIndicator />

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

              {/* User Menu */}
              <div class="header-user-menu">
                <span class="user-email" title={user.email}>
                  {user.email}
                </span>
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
