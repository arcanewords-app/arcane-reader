import type { ComponentChildren } from 'preact';
import './CardGrid.css';

interface CardGridProps {
  variant?: 'publication' | 'project';
  class?: string;
  children: ComponentChildren;
}

export function CardGrid({
  variant = 'publication',
  class: classAttr = '',
  children,
}: CardGridProps) {
  const classes = ['card-grid', variant === 'project' && 'card-grid--project', classAttr]
    .filter(Boolean)
    .join(' ');
  return <div class={classes}>{children}</div>;
}
