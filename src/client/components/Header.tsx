import { useState, useEffect } from 'preact/hooks';
import type { SystemStatus, AuthUser } from '../types';
import { Button } from './ui';
import './Header.css';

interface HeaderProps {
  status: 'loading' | 'ready' | 'error';
  systemStatus: SystemStatus | null;
  user?: AuthUser | null;
  onLogout?: () => void;
  onMenuToggle?: () => void;
}

export function Header({ status, systemStatus, user, onLogout, onMenuToggle }: HeaderProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [isDashboard, setIsDashboard] = useState(false);

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
    if (status === 'loading') return 'Проверка...';
    if (status === 'error') return 'Ошибка соединения';
    if (systemStatus?.ai.configured) return 'Подключено';
    return 'API не настроен';
  };

  return (
    <header>
      <div class="header-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {onMenuToggle && isMobile && !isDashboard && (
            <button class="mobile-menu-btn" onClick={onMenuToggle} aria-label="Меню">
              ☰
            </button>
          )}
          <div class="logo">
            <img src="/arcane_icon.png" alt="Arcane" class="logo-icon-img" />
            <div>
              <div class="logo-text">ARCANE</div>
              <div class="logo-subtitle">AI Переводчик новелл</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div class={`api-status ${status}`}>
            <span class="status-dot"></span>
            <span class="status-text">{getStatusText()}</span>
          </div>
          {user && (
            <div class="user-menu">
              <span class="user-menu-email">
                {user.email}
              </span>
              <Button variant="secondary" onClick={onLogout} size="sm" className="user-menu-button">
                Выйти
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

