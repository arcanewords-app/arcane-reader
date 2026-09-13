import type { ComponentChildren } from 'preact';
import './PageHeader.css';

interface PageHeaderProps {
  title: string;
  subtitle?: ComponentChildren;
  actions?: ComponentChildren;
  children?: ComponentChildren;
}

export function PageHeader({ title, subtitle, actions, children }: PageHeaderProps) {
  return (
    <div class="page-header">
      <div class="page-header-row">
        <div class="page-header-copy">
          <h1 class="page-header-title">{title}</h1>
          {subtitle ? <div class="page-header-subtitle">{subtitle}</div> : null}
        </div>
        {actions ? <div class="page-header-actions">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}
