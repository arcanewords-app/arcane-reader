interface PlSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface PlSelectProps {
  label: string;
  value: string;
  options: PlSelectOption[];
  onChange: (value: string) => void;
  hint?: string;
  id?: string;
  disabled?: boolean;
}

export function PlSelect({ label, value, options, onChange, hint, id, disabled }: PlSelectProps) {
  const selectId = id ?? `pl-select-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <label class="pl-field">
      <span class="pl-label">{label}</span>
      <select
        id={selectId}
        class="pl-select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <span class="pl-hint">{hint}</span> : null}
    </label>
  );
}
