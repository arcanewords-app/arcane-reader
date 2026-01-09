import type { JSX } from 'preact';

interface InputProps extends JSX.HTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, id, className = '', ...props }: InputProps) {
  return (
    <div class="form-group">
      {label && (
        <label class="form-label" for={id}>
          {label}
        </label>
      )}
      <input
        id={id}
        class={`form-input ${className}`}
        {...props}
      />
    </div>
  );
}

interface SelectProps extends JSX.HTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, id, options, className = '', ...props }: SelectProps) {
  return (
    <div class="form-group">
      {label && (
        <label class="form-label" for={id}>
          {label}
        </label>
      )}
      <select id={id} class={`form-select ${className}`} {...props}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface SliderProps extends Omit<JSX.HTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  displayValue?: string;
  hint?: string;
}

export function Slider({
  label,
  displayValue,
  hint,
  className = '',
  ...props
}: SliderProps) {
  return (
    <div class="setting-group">
      {label && <label class="setting-label">{label}</label>}
      <div class="slider-container">
        <input type="range" class={`slider ${className}`} {...props} />
        {displayValue && <span class="slider-value">{displayValue}</span>}
      </div>
      {hint && <span class="setting-hint">{hint}</span>}
    </div>
  );
}

