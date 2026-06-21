import type { ComponentChildren } from 'preact';
import './admin-shared.css';

interface AdminSectionProps {
  title: string;
  children: ComponentChildren;
  class?: string;
  as?: 'section' | 'form';
  onSubmit?: (e: Event) => void;
  formId?: string;
}

export function AdminSection({
  title,
  children,
  class: className,
  as = 'section',
  onSubmit,
  formId,
}: AdminSectionProps) {
  const classes = `admin-section ${className ?? ''}`.trim();

  if (as === 'form') {
    return (
      <form id={formId} class={classes} onSubmit={onSubmit}>
        <h2>{title}</h2>
        {children}
      </form>
    );
  }

  return (
    <section class={classes}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
