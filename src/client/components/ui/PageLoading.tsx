import { LoadingSpinner } from './LoadingSpinner';

interface PageLoadingProps {
  text?: string;
}

/**
 * Full-page loading state with centered spinner.
 * Uses the shared page-loading layout class.
 */
export function PageLoading({ text }: PageLoadingProps) {
  return (
    <div class="page-loading">
      <LoadingSpinner size="lg" text={text} />
    </div>
  );
}
