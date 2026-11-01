/**
 * Route wrapper that requires author+ role.
 * Shows UpgradeScreen when user is authenticated but has role 'user'.
 * Shows loading while user is being fetched; returns null when guest (parent handles redirect).
 */

import { useUserRole } from '../../hooks/useUserRole';
import { UpgradeScreen } from './UpgradeScreen';
import { LoadingSpinner } from '../ui';
import { renderRoutedPage, type RoutedGateProps } from './routedComponent';

export function AuthorGate<C extends (props: never) => preact.ComponentChildren>({
  path,
  component: Component,
  ...rest
}: RoutedGateProps<C>) {
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

  if (!isAtLeast('author')) {
    return <UpgradeScreen />;
  }

  return renderRoutedPage(Component, { ...rest, path });
}
