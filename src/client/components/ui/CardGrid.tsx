import type { ComponentChildren } from 'preact';
import './CardGrid.css';

interface CardGridProps {
  variant?: 'publication' | 'project' | 'request';
  class?: string;
  children: ComponentChildren;
}

export function CardGrid({
  variant = 'publication',
  class: classAttr = '',
  children,
}: CardGridProps) {
  const variantClass =
    variant === 'project'
      ? 'card-grid--project'
      : variant === 'request'
        ? 'card-grid--request'
        : '';
  const classes = ['card-grid', variantClass, classAttr].filter(Boolean).join(' ');
  return <div class={classes}>{children}</div>;
}
