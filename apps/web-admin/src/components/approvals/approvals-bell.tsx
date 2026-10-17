import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { ArrowRightIcon, BellIcon, CheckIcon, WalletIcon } from 'lucide-react';
import type { ApprovalItem, ApprovalSummary } from '@eduvault/api-contract';
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@eduvault/ui';
import { searchFor } from '../../route-search-defaults';
import { APPROVAL_KIND_UI, amountOf } from './approval-copy';
import { useApprovalsSummary } from './use-approvals-summary';

function WaitingItem({
  item,
  currency,
  onOpen,
}: {
  item: ApprovalItem;
  currency: string;
  onOpen: (item: ApprovalItem) => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="flex w-full items-start gap-2 rounded-md p-2 text-left hover:bg-muted"
        onClick={() => {
          onOpen(item);
        }}
      >
        <WalletIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{item.label}</span>
          <span className="text-xs text-muted-foreground">{item.details}</span>
        </span>
        <span className="text-sm tabular-nums">{amountOf(item, currency)}</span>
      </button>
    </li>
  );
}

function AllClear() {
  return (
    <Empty className="p-4">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CheckIcon />
        </EmptyMedia>
        <EmptyTitle>All clear</EmptyTitle>
        <EmptyDescription>
          Nothing is waiting for your approval.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function WaitingList({
  summary,
  onOpen,
}: {
  summary: ApprovalSummary | undefined;
  onOpen: (item: ApprovalItem) => void;
}) {
  if (summary === undefined || summary.preview.length === 0) {
    return <AllClear />;
  }
  return (
    <ul className="flex flex-col">
      {summary.preview.map((item) => (
        <WaitingItem
          key={`${item.kind}-${item.id}`}
          item={item}
          currency={summary.currency}
          onOpen={onOpen}
        />
      ))}
    </ul>
  );
}

function BellButton({ count }: { count: number }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Approvals"
            className="relative"
          >
            <BellIcon />
            {count > 0 ? (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-4 min-w-4 px-1"
              >
                {count}
              </Badge>
            ) : null}
          </Button>
        </PopoverTrigger>
      </TooltipTrigger>
      <TooltipContent>
        {count > 0 ? `${count} waiting for your approval` : 'Approvals'}
      </TooltipContent>
    </Tooltip>
  );
}

export function ApprovalsBell() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const summary = useApprovalsSummary();
  const count = summary?.waitingForMe ?? 0;
  const openItem = (item: ApprovalItem) => {
    setOpen(false);
    void router.navigate({
      to: '/finance/adjustments',
      search: searchFor('/finance/adjustments', {
        tab: APPROVAL_KIND_UI[item.kind].tab,
      }),
    });
  };
  const openQueue = () => {
    setOpen(false);
    void router.navigate({ to: '/approvals' });
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <BellButton count={count} />
      <PopoverContent align="end" className="w-96">
        <PopoverHeader className="flex-row items-center justify-between">
          <PopoverTitle>Waiting for you</PopoverTitle>
          {count > 0 ? (
            <Button type="button" variant="ghost" size="xs" onClick={openQueue}>
              Open approvals
              <ArrowRightIcon />
            </Button>
          ) : null}
        </PopoverHeader>
        <WaitingList summary={summary} onOpen={openItem} />
      </PopoverContent>
    </Popover>
  );
}
