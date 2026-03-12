import './LoadingSpinner.css';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  fullScreen?: boolean;
}

export function LoadingSpinner({ size = 'md', text, fullScreen = false }: LoadingSpinnerProps) {
  const sizeClass = `spinner-${size}`;
  const ariaLabel = text || 'Loading';

  if (fullScreen) {
    return (
      <div
        class="loading-spinner-fullscreen"
        role="status"
        aria-live="polite"
        aria-label={ariaLabel}
      >
        <div class={`spinner ${sizeClass}`} aria-hidden="true"></div>
        {text && <p class="loading-spinner-text">{text}</p>}
      </div>
    );
  }

  return (
    <div
      class="loading-spinner-inline"
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      <div class={`spinner ${sizeClass}`} aria-hidden="true"></div>
      {text && <span class="loading-spinner-text">{text}</span>}
    </div>
  );
}
