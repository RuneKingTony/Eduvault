import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckIcon, InfoIcon } from 'lucide-react';
import { APPROVAL_PAGE_SIZE, type ApprovalItem } from '@eduvault/api-contract';
import { usePermissions } from '@eduvault/auth-client';
import { can } from '@eduvault/policy';
import {
  Card,
  CardContent,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  NumberedPager,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@eduvault/ui';
import { useApi } from '../api';
import {
  ApproveDialog,
  DeclineDialog,
} from '../components/approvals/approval-dialogs';
import { ApprovalsTable } from '../components/approvals/approvals-table';
import { QueryState } from '../components/money/query-state';
import { approvalsQueryOptions } from '../queries';

function NothingToApprove() {
  return (
    <section className="flex flex-col gap-4">
      <h1>Approvals</h1>
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Nothing to approve</EmptyTitle>
          <EmptyDescription>
            Requests that need a second pair of eyes will wait here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </section>
  );
}

function Header() {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="flex items-center gap-2">
        Approvals
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="About approvals"
              className="text-muted-foreground"
            >
              <InfoIcon className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            Staff ask, a boss approves. You can’t approve your own request.
          </TooltipContent>
        </Tooltip>
      </h1>
      <p className="text-sm text-muted-foreground">
        Requests waiting for you to approve: money corrections and staff leave.
      </p>
    </header>
  );
}

function QueueEmpty() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CheckIcon />
        </EmptyMedia>
        <EmptyTitle>Nothing waiting for you</EmptyTitle>
        <EmptyDescription>
          When staff ask for leave, or to refund, discount, write off or void a
          payment, the request appears here.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function Queue({ canDecide }: { canDecide: boolean }) {
  const [page, setPage] = useState(1);
  const [approving, setApproving] = useState<ApprovalItem | null>(null);
  const [declining, setDeclining] = useState<ApprovalItem | null>(null);
  const queue = useQuery(approvalsQueryOptions(useApi(), page));
  const lastPage = Math.ceil((queue.data?.total ?? 0) / APPROVAL_PAGE_SIZE);
  if (queue.data?.items.length === 0 && lastPage > 0 && page > lastPage) {
    setPage(lastPage);
  }
  return (
    <>
      <QueryState query={queue} skeletonClassName="h-48">
        {(data) => (
          <Card>
            <CardContent className="px-0">
              {data.items.length === 0 ? (
                <QueueEmpty />
              ) : (
                <ApprovalsTable
                  items={data.items}
                  currency={data.currency}
                  canDecide={canDecide}
                  onApprove={setApproving}
                  onDecline={setDeclining}
                />
              )}
              {data.total > APPROVAL_PAGE_SIZE ? (
                <NumberedPager
                  page={page}
                  total={data.total}
                  pageSize={APPROVAL_PAGE_SIZE}
                  onPage={setPage}
                />
              ) : null}
            </CardContent>
          </Card>
        )}
      </QueryState>
      <ApproveDialog
        item={approving}
        currency={queue.data?.currency ?? 'NGN'}
        onClose={() => {
          setApproving(null);
        }}
      />
      <DeclineDialog
        item={declining}
        onClose={() => {
          setDeclining(null);
        }}
      />
    </>
  );
}

export function ApprovalsPage() {
  const access = usePermissions();
  const canDecide = can(access.permissions, 'adjustment', 'approve');
  if (!canDecide && access.acting === null) {
    return <NothingToApprove />;
  }
  return (
    <section className="flex flex-col gap-4">
      <Header />
      <Queue canDecide={canDecide} />
    </section>
  );
}
