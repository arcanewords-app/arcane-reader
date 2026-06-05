import type { ComponentChildren } from 'preact';

export function PageToolbar({ children }: { children: ComponentChildren }) {
  return <div class="dbg-toolbar">{children}</div>;
}

export function ToolbarGroup({ children }: { children: ComponentChildren }) {
  return <span class="dbg-toolbar-group">{children}</span>;
}

export function ToolbarSpacer() {
  return <span class="dbg-toolbar-spacer" />;
}

export function ToolbarLabel({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <label class="dbg-label">
      {label}
      {children}
    </label>
  );
}
