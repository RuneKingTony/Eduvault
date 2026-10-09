import { useId } from 'react';

export interface SwitcherOption {
  id: string;
  name: string;
}

export interface ContextSwitcherProps {
  label: string;
  options: readonly SwitcherOption[];
  value: string | null | undefined;
  onChange: (id: string) => void;
  disabled?: boolean;
}

/** Shared by the school and campus switchers of both SPAs. */
export function ContextSwitcher({
  label,
  options,
  value,
  onChange,
  disabled,
}: ContextSwitcherProps) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        className="rounded-md border border-input px-2 py-1 text-sm"
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {(value ?? '') === '' ? <option value="">Select…</option> : null}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}
