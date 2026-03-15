import { route } from 'preact-router';
import { useTranslation } from 'react-i18next';
import { useUserRole } from '../../hooks/useUserRole';
import { Button, LoadingSpinner } from '../ui';

export interface AdminGateProps {
  path: string;
  component: preact.ComponentType<Record<string, unknown>>;
  [key: string]: unknown;
}

export function AdminGate({ path, component: Component, ...rest }: AdminGateProps) {
  const { t } = useTranslation();
  const { user, isAtLeast } = useUserRole();

  if (!user) {
    return (
      <div
        class="page-loading"
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '40vh',
        }}
      >
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isAtLeast('admin')) {
    return (
      <div
        class="admin-denied"
        style={{
          maxWidth: '680px',
          margin: '2rem auto',
          padding: '1.25rem',
          border: '1px solid var(--color-border, #2b2b2b)',
          borderRadius: '12px',
        }}
      >
        <h2>{t('admin.deniedTitle')}</h2>
        <p>{t('admin.deniedMessage')}</p>
        <Button variant="secondary" onClick={() => route('/')}>
          {t('common.back')}
        </Button>
      </div>
    );
  }

  return <Component path={path} {...rest} />;
}
