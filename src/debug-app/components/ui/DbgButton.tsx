import type { ButtonHTMLAttributes, ComponentChildren } from 'preact';

type DbgButtonVariant = 'default' | 'primary' | 'ghost';

interface DbgButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: DbgButtonVariant;
  children: ComponentChildren;
  disabled?: boolean;
}

export function DbgButton({
  variant = 'default',
  class: className = '',
  children,
  ...props
}: DbgButtonProps) {
  return (
    <button type="button" class={`dbg-btn dbg-btn--${variant} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
