import type { SystemStatus } from '../types';

interface HeaderProps {
  status: 'loading' | 'ready' | 'error';
  systemStatus: SystemStatus | null;
}

export function Header({ status, systemStatus }: HeaderProps) {
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
        <div class={`api-status ${status}`}>
          <span class="status-dot"></span>
          <span class="status-text">{getStatusText()}</span>
        </div>
      </div>
    </header>
  );
}

