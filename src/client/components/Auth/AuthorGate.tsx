/**
 * Route wrapper that requires author+ role.
 * Shows UpgradeScreen when user is authenticated but has role 'user'.
 * Returns null when guest (parent useEffect handles redirect).
 */

import { useUserRole } from '../../hooks/useUserRole';
import { UpgradeScreen } from './UpgradeScreen';

export interface AuthorGateProps {
  path: string;
  component: preact.ComponentType<Record<string, unknown>>;
  [key: string]: unknown;
}

export function AuthorGate({ path, component: Component, ...rest }: AuthorGateProps) {
  const { user, isAtLeast } = useUserRole();

  if (!user) {
    return null;
  }

  if (!isAtLeast('author')) {
    return <UpgradeScreen />;
  }

  return <Component path={path} {...rest} />;
}
