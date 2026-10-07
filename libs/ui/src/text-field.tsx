import { useId, type InputHTMLAttributes } from 'react';
import { cn } from './cn';

export function TextField({
  label,
  className,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        className={cn(
          'rounded-md border border-slate-300 px-3 py-2 text-sm',
          className
        )}
        {...props}
      />
    </div>
  );
}
