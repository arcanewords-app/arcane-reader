import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

interface PlCollapsibleProps {
  title: string;
  defaultOpen?: boolean;
  children: ComponentChildren;
}

export function PlCollapsible({ title, defaultOpen = false, children }: PlCollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div class={`pl-collapsible${open ? ' open' : ''}`}>
      <button
        type="button"
        class="pl-collapsible-trigger"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span class="pl-collapsible-chevron">{open ? '▼' : '▶'}</span>
        {title}
      </button>
      {open ? <div class="pl-collapsible-body">{children}</div> : null}
    </div>
  );
}
