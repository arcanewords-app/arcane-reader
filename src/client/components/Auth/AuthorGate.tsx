/**
 * Route wrapper that requires author+ role.
 * Shows UpgradeScreen when user is authenticated but has role 'user'.
 * Shows loading while user is being fetched; returns null when guest (parent handles redirect).
 */

import { useUserRole } from '../../hooks/useUserRole';
import { UpgradeScreen } from './UpgradeScreen';
import { LoadingSpinner } from '../ui';

export interface AuthorGateProps {
  path: string;
  component: preact.ComponentType<Record<string, unknown>>;
  [key: string]: unknown;
}

export function AuthorGate({ path, component: Component, ...rest }: AuthorGateProps) {
  const { user, isAtLeast } = useUserRole();

  if (!user) {
    return (
      <div class="page-loading" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isAtLeast('author')) {
    return <UpgradeScreen />;
  }

  return <Component path={path} {...rest} />;
}
