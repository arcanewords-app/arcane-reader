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

export function Header({ status, systemStatus, user, onLogout, onMenuToggle, onOpenLogin, onOpenRegister }: HeaderProps) {
  const { t, i18n } = useTranslation();
  const [isMobile, setIsMobile] = useState(false);
  const [hasSidebar, setHasSidebar] = useState(false);
  const currentLocale = (i18n.language || 'ru') as AppLocale;

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    const checkPath = () => {
      const path = window.location.pathname;
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
        {/* Верхний слой: логотип слева | навигация справа */}
        <div class="header-top-row">
          <a href="/" onClick={(e) => { e.preventDefault(); route('/'); }} class="logo" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <img src="/arcane_icon.png" alt="Arcane" class="logo-icon-img" />
            <div>
              <div class="logo-text">ARCANE</div>
              <div class="logo-subtitle">{t('header.logoSubtitle')}</div>
            </div>
          </a>
          <div class="header-nav">
            <div class="header-locale" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span class="header-locale-label" style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginRight: '0.25rem' }}>{t('header.appLanguage')}:</span>
              {(['ru', 'en', 'pl'] as AppLocale[]).map((locale) => (
                <button
                  key={locale}
                  type="button"
                  class={`header-locale-btn ${currentLocale === locale ? 'active' : ''}`}
                  style={{
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.8rem',
                    borderRadius: '4px',
                    border: currentLocale === locale ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: currentLocale === locale ? 'var(--bg-tertiary)' : 'transparent',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontWeight: currentLocale === locale ? 600 : 400,
                  }}
                  onClick={() => setSavedLocale(locale)}
                  title={locale === 'ru' ? t('settings.appLanguageRu') : locale === 'en' ? t('settings.appLanguageEn') : t('settings.appLanguagePl')}
                >
                  {locale.toUpperCase()}
                </button>
              ))}
            </div>
            {user ? (
              <>
                <div class={`api-status ${status}`}>
                  <span class="status-dot"></span>
                  <span class="status-text">{getStatusText()}</span>
                </div>
                <a href="/" onClick={(e) => { e.preventDefault(); route('/'); }} class="header-catalog-link" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textDecoration: 'none', marginRight: '0.5rem' }}>
                  {t('cabinet.catalog')}
                </a>
                <a href="/cabinet" onClick={(e) => { e.preventDefault(); route('/cabinet'); }} class="header-cabinet-link" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textDecoration: 'none', marginRight: '0.5rem' }}>
                  {t('cabinet.link')}
                </a>
                <TokenUsageIndicator />
              </>
            ) : (
              (onOpenLogin || onOpenRegister) && (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <Button variant="secondary" size="sm" onClick={onOpenLogin}>
                    {t('header.login')}
                  </Button>
                  <Button variant="primary" size="sm" onClick={onOpenRegister ?? onOpenLogin}>
                    {t('header.register')}
                  </Button>
                </div>
              )
            )}
          </div>
        </div>
        {/* Нижний слой (авторизованный): гамбургер слева | email центр | logout справа */}
        {user && (
          <div class="header-user-row">
                {onMenuToggle && isMobile && hasSidebar && (
                  <button class="mobile-menu-btn" onClick={onMenuToggle} aria-label={t('header.menuAria')}>
                    ☰
                  </button>
                )}
                <span class="user-menu-email" title={user.email}>
                  {user.email}
                </span>
                <Button variant="secondary" onClick={onLogout} size="sm" className="user-menu-button">
                  {t('header.logout')}
                </Button>
              </div>
        )}
      </div>
    </header>
  );
}

