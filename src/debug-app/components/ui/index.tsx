import type { JSX } from 'preact';
import './ui.css';

interface DbgInputProps extends JSX.HTMLAttributes<HTMLInputElement> {
  width?: 'xs' | 'sm' | 'md' | 'lg';
  placeholder?: string;
  value?: string;
  onInput?: JSX.GenericEventHandler<HTMLInputElement>;
}

export function DbgInput({ width, class: className = '', ...props }: DbgInputProps) {
  const widthClass = width ? `dbg-input-${width}` : '';
  return <input class={`dbg-input ${widthClass} ${className}`.trim()} {...props} />;
}

interface DbgSelectProps extends JSX.HTMLAttributes<HTMLSelectElement> {
  options: Array<{ value: string; label: string }>;
  value?: string;
  onChange?: JSX.GenericEventHandler<HTMLSelectElement>;
}

export function DbgSelect({ options, class: className = '', ...props }: DbgSelectProps) {
  return (
    <select class={`dbg-select ${className}`.trim()} {...props}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

interface DbgCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export function DbgCheckbox({ checked, onChange, label }: DbgCheckboxProps) {
  return (
    <label class="dbg-checkbox-label">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      {label}
    </label>
  );
}

interface DbgBadgeProps {
  children: preact.ComponentChildren;
  variant?: 'default' | 'worker';
  title?: string;
}

export function DbgBadge({ children, variant = 'default', title }: DbgBadgeProps) {
  return (
    <span class={`dbg-badge${variant === 'worker' ? ' worker' : ''}`} title={title}>
      {children}
    </span>
  );
}

interface StatusChipProps {
  enabled: boolean;
  onLabel: string;
  offLabel: string;
}

export function StatusChip({ enabled, onLabel, offLabel }: StatusChipProps) {
  return (
    <span class={`dbg-status-chip${enabled ? ' on' : ''}`}>{enabled ? onLabel : offLabel}</span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p class="dbg-empty-state">{message}</p>;
}

export function Toast({ message, visible }: { message: string; visible: boolean }) {
  return <div class={`dbg-toast${visible ? ' show' : ''}`}>{message}</div>;
}
