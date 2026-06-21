import { useEffect } from 'preact/hooks';
import { route } from 'preact-router';

/** Redirect /admin to default entities tab. */
export function AdminRedirect() {
  useEffect(() => {
    route('/admin/entities/tag', true);
  }, []);
  return null;
}

/** Redirect legacy /admin/entities to tag tab. */
export function AdminEntitiesRedirect() {
  useEffect(() => {
    route('/admin/entities/tag', true);
  }, []);
  return null;
}
