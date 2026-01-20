import './LoadingSpinner.css';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  fullScreen?: boolean;
}

export function LoadingSpinner({ size = 'md', text, fullScreen = false }: LoadingSpinnerProps) {
  const sizeClass = `spinner-${size}`;
  
  if (fullScreen) {
    return (
      <div class="loading-spinner-fullscreen">
        <div class={`spinner ${sizeClass}`}></div>
        {text && <p class="loading-spinner-text">{text}</p>}
      </div>
    );
  }
  
  return (
    <div class="loading-spinner-inline">
      <div class={`spinner ${sizeClass}`}></div>
      {text && <span class="loading-spinner-text">{text}</span>}
    </div>
  );
}
