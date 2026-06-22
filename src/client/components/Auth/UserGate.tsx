/**
 * Route wrapper that requires user+ (authenticated).
 * Shows loading while user is being fetched; parent redirects guests.
 */

import { useUserRole } from '../../hooks/useUserRole';
import { LoadingSpinner } from '../ui';

export interface UserGateProps {
  path: string;
  component: preact.ComponentType<Record<string, unknown>>;
  [key: string]: unknown;
}

export function UserGate({ path, component: Component, ...rest }: UserGateProps) {
  const { user } = useUserRole();

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

  return <Component path={path} {...rest} />;
}
