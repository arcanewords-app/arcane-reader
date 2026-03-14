import './Icon.css';

type IconSize = 'sm' | 'md' | 'lg';

interface IconProps {
  name: string;
  size?: IconSize;
  filled?: boolean;
  className?: string;
}

export function Icon({ name, size = 'md', filled = false, className = '' }: IconProps) {
  const classes = [
    'material-symbols-outlined',
    'ui-icon',
    `ui-icon-${size}`,
    filled && 'ui-icon-filled',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span class={classes} aria-hidden="true">
      {name}
    </span>
  );
}
