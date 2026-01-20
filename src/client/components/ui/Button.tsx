import type { JSX } from 'preact';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'glossary';
export type ButtonSize = 'sm' | 'md' | 'full';

interface ButtonProps extends Omit<JSX.HTMLAttributes<HTMLButtonElement>, 'size'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: preact.ComponentChildren;
}

export function Button({
  variant = 'primary',
  size,
  loading = false,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  const classes = [
    'btn',
    `btn-${variant}`,
    size === 'sm' && 'btn-sm',
    size === 'full' && 'btn-full',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      class={classes}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <span class="spinner" /> : children}
    </button>
  );
}

