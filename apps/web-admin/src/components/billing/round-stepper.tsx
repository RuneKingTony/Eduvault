import { CheckIcon } from 'lucide-react';
import type { BillingRunStatus } from '@eduvault/api-contract';
import { cn } from '@eduvault/ui';

const STEPS = ['Prepared', 'Sent'] as const;

export function RoundStepper({ status }: { status: BillingRunStatus }) {
  const reached = status === 'issued' ? 2 : 1;
  return (
    <ol aria-label="Progress" className="flex items-center gap-3 text-sm">
      {STEPS.map((step, index) => {
        const done = index < reached;
        const current = index === reached - 1;
        return (
          <li
            key={step}
            aria-current={current ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2',
              done ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            <span
              className={cn(
                'flex size-5 items-center justify-center rounded-full border text-xs',
                done && 'border-primary bg-primary text-primary-foreground'
              )}
            >
              {done && !current ? (
                <CheckIcon className="size-3" aria-hidden="true" />
              ) : (
                index + 1
              )}
            </span>
            {step}
          </li>
        );
      })}
    </ol>
  );
}
