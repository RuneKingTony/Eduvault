import { useId, type ComponentProps } from 'react';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';

export function TextField({
  label,
  ...props
}: { label: string } & ComponentProps<'input'>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  );
}
