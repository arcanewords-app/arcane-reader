import type { HTMLAttributes } from 'preact';
import './Card.css';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  children: preact.ComponentChildren;
}

export function Card({
  title,
  className = '',
  class: classAttr = '',
  children,
  ...props
}: CardProps) {
  const classes = `card ${className} ${classAttr}`.trim();
  return (
    <div class={classes} {...props}>
      {title && <div class="card-title">{title}</div>}
      {children}
    </div>
  );
}
