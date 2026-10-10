import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

type PageSlot = { kind: 'page'; page: number } | { kind: 'gap'; after: number };

function pageSlots(page: number, pageCount: number): PageSlot[] {
  const wanted = new Set(
    [1, page - 1, page, page + 1, pageCount].filter(
      (candidate) => candidate >= 1 && candidate <= pageCount
    )
  );
  const slots: PageSlot[] = [];
  let previous = 0;
  for (const candidate of [...wanted].toSorted((a, b) => a - b)) {
    if (candidate - previous > 1) {
      slots.push({ kind: 'gap', after: previous });
    }
    slots.push({ kind: 'page', page: candidate });
    previous = candidate;
  }
  return slots;
}

function PageSlotView({
  slot,
  page,
  onPage,
}: {
  slot: PageSlot;
  page: number;
  onPage: (page: number) => void;
}) {
  if (slot.kind === 'gap') {
    return (
      <span aria-hidden="true" className="px-1 text-muted-foreground">
        …
      </span>
    );
  }
  return (
    <Button
      type="button"
      variant={slot.page === page ? 'default' : 'outline'}
      size="sm"
      aria-label={`Page ${slot.page}`}
      aria-current={slot.page === page ? 'page' : undefined}
      onClick={() => {
        onPage(slot.page);
      }}
    >
      {slot.page}
    </Button>
  );
}

function StepButton({
  label,
  disabled,
  onStep,
}: {
  label: string;
  disabled: boolean;
  onStep: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={onStep}
    >
      {label}
    </Button>
  );
}

const slotKey = (slot: PageSlot) =>
  slot.kind === 'gap' ? `gap-after-${slot.after}` : `page-${slot.page}`;

export function NumberedPager({
  page,
  total,
  pageSize,
  onPage,
  className,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  className?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = Math.min((page - 1) * pageSize + 1, total);
  const to = Math.min(page * pageSize, total);
  return (
    <nav
      aria-label="Pages"
      className={cn(
        'flex items-center justify-between gap-3 p-3 text-sm',
        className
      )}
    >
      <span className="text-muted-foreground">
        Showing {from} to {to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <StepButton
          label="Previous"
          disabled={page <= 1}
          onStep={() => {
            onPage(page - 1);
          }}
        />
        {pageSlots(page, pageCount).map((slot) => (
          <PageSlotView
            key={slotKey(slot)}
            slot={slot}
            page={page}
            onPage={onPage}
          />
        ))}
        <StepButton
          label="Next"
          disabled={page >= pageCount}
          onStep={() => {
            onPage(page + 1);
          }}
        />
      </div>
    </nav>
  );
}
