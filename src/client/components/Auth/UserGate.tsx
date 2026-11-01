/**
 * Route wrapper that requires user+ (authenticated).
 * Shows loading while user is being fetched; parent redirects guests.
 */

import { useUserRole } from '../../hooks/useUserRole';
import { LoadingSpinner } from '../ui';
import { renderRoutedPage, type RoutedGateProps } from './routedComponent';

export function UserGate<C extends (props: never) => preact.ComponentChildren>({
  path,
  component: Component,
  ...rest
}: RoutedGateProps<C>) {
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

  return renderRoutedPage(Component, { ...rest, path });
}
