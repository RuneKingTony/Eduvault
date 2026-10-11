import { useId, type ComponentProps } from 'react';
import { Label } from '../ui/label';
import { NativeSelect } from '../ui/native-select';

export function SelectField({
  label,
  hint,
  children,
  ...props
}: {
  label: string;
  hint?: string;
} & Omit<ComponentProps<'select'>, 'size'>) {
  const id = useId();
  const hintId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect
        id={id}
        className="w-full"
        aria-describedby={hint === undefined ? undefined : hintId}
        {...props}
      >
        {children}
      </NativeSelect>
      {hint === undefined ? null : (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
