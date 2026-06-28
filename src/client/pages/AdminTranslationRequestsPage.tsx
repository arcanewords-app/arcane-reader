import { useEffect } from 'preact/hooks';
import { route } from 'preact-router';

/** Legacy admin tab — moderation lives on the author board. */
export function AdminTranslationRequestsPage() {
  useEffect(() => {
    route('/translation-requests');
    window.history.replaceState({}, '', '/translation-requests');
  }, []);
  return null;
}
