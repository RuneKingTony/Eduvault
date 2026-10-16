import { MapPinIcon } from 'lucide-react';
import type { FeeGridCell } from '@eduvault/api-contract';
import { money } from '@eduvault/shared';
import { Badge, Tooltip, TooltipContent, TooltipTrigger } from '@eduvault/ui';
import { GRID_APPLIES_TO_LABELS, OPTIONAL_TIP, OVERRIDE_TIP } from './fee-text';

type Amounted = Pick<
  FeeGridCell['overrides'][number],
  'appliesTo' | 'isOptional'
>;

function Badges({ amount }: { amount: Amounted }) {
  return (
    <>
      {amount.isOptional ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline">Optional</Badge>
          </TooltipTrigger>
          <TooltipContent>{OPTIONAL_TIP}</TooltipContent>
        </Tooltip>
      ) : null}
      {amount.appliesTo === 'all' ? null : (
        <Badge variant="secondary">
          {GRID_APPLIES_TO_LABELS[amount.appliesTo]}
        </Badge>
      )}
    </>
  );
}

function Override({
  override,
  currency,
}: {
  override: FeeGridCell['overrides'][number];
  currency: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPinIcon className="size-3" aria-hidden="true" />
          {override.campusName} {money(override.amountMinor, currency)}
          <Badges amount={override} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{OVERRIDE_TIP}</TooltipContent>
    </Tooltip>
  );
}

export function FeeCell({
  cell,
  currency,
}: {
  cell: FeeGridCell;
  currency: string;
}) {
  if (cell.base === null && cell.overrides.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-1.5">
        {cell.base === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <>
            <span className="font-medium tabular-nums">
              {money(cell.base.amountMinor, currency)}
            </span>
            <Badges amount={cell.base} />
          </>
        )}
      </span>
      {cell.overrides.map((override) => (
        <Override
          key={override.feeLineId}
          override={override}
          currency={currency}
        />
      ))}
    </div>
  );
}
