import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
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
}

export function Header({ status, systemStatus, user, onLogout, onMenuToggle }: HeaderProps) {
  const { t, i18n } = useTranslation();
  const [isMobile, setIsMobile] = useState(false);
  const [isDashboard, setIsDashboard] = useState(false);
  const currentLocale = (i18n.language || 'ru') as AppLocale;

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    const checkDashboard = () => {
      setIsDashboard(window.location.pathname === '/' || window.location.pathname === '');
    };

    checkMobile();
    checkDashboard();
    
    window.addEventListener('resize', checkMobile);
    window.addEventListener('popstate', checkDashboard);
    // Also check on navigation
    const interval = setInterval(checkDashboard, 100);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('popstate', checkDashboard);
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {onMenuToggle && isMobile && !isDashboard && (
            <button class="mobile-menu-btn" onClick={onMenuToggle} aria-label={t('header.menuAria')}>
              ☰
            </button>
          )}
          <div class="logo">
            <img src="/arcane_icon.png" alt="Arcane" class="logo-icon-img" />
            <div>
              <div class="logo-text">ARCANE</div>
              <div class="logo-subtitle">{t('header.logoSubtitle')}</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* App language switcher */}
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
          <div class={`api-status ${status}`}>
            <span class="status-dot"></span>
            <span class="status-text">{getStatusText()}</span>
          </div>
          {user && (
            <>
              <TokenUsageIndicator />
              <div class="user-menu">
                <span class="user-menu-email">
                  {user.email}
                </span>
                <Button variant="secondary" onClick={onLogout} size="sm" className="user-menu-button">
                  {t('header.logout')}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

