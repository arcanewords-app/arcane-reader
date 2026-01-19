import type { SystemStatus, AuthUser } from '../types';
import { Button } from './ui';

interface HeaderProps {
  status: 'loading' | 'ready' | 'error';
  systemStatus: SystemStatus | null;
  user?: AuthUser | null;
  onLogout?: () => void;
}

export function Header({ status, systemStatus, user, onLogout }: HeaderProps) {
  const getStatusText = () => {
    if (status === 'loading') return 'Проверка...';
    if (status === 'error') return 'Ошибка соединения';
    if (systemStatus?.ai.configured) return 'Подключено';
    return 'API не настроен';
  };

  return (
    <header>
      <div class="header-content">
        <div class="logo">
          <img src="/arcane_icon.png" alt="Arcane" class="logo-icon-img" />
          <div>
            <div class="logo-text">ARCANE</div>
            <div class="logo-subtitle">AI Переводчик новелл</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div class={`api-status ${status}`}>
            <span class="status-dot"></span>
            <span class="status-text">{getStatusText()}</span>
          </div>
          {user && (
            <div class="user-menu" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                {user.email}
              </span>
              <Button variant="secondary" onClick={onLogout} size="sm">
                Выйти
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

