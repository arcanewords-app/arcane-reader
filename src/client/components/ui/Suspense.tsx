import { ComponentChildren } from 'preact';
import { LoadingSpinner } from './LoadingSpinner';

interface SuspenseProps {
  fallback?: ComponentChildren;
  children: ComponentChildren;
}

export function Suspense({ fallback, children }: SuspenseProps) {
  // Simple Suspense implementation - just render children
  // For real lazy loading, we'd need to handle promises
  // But for code splitting with Vite, dynamic imports work automatically
  return <>{children}</>;
}
