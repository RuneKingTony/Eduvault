import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckIcon, InfoIcon } from 'lucide-react';
import {
  APPROVAL_PAGE_SIZE,
  APPROVAL_PILLARS,
  type ApprovalItem,
  type ApprovalList,
} from '@eduvault/api-contract';
import { usePermissions } from '@eduvault/auth-client';
import { can } from '@eduvault/policy';
import {
  Badge,
  Card,
  CardContent,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Label,
  NumberedPager,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
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
import { LeaveOnlyApprovalsPage } from '../components/leave/leave-only-approvals-page';
import { MyLeaveCard } from '../components/leave/my-leave-card';
import { QueryState } from '../components/money/query-state';
import type { ApprovalsSearch } from '../approvals-search';
import { approvalsQueryOptions } from '../queries';

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

const TAB_LABELS = { all: 'All', money: 'Money', leave: 'Leave' } as const;

function Toolbar({
  data,
  tab,
  includeOthers,
  onTab,
  onIncludeOthers,
}: {
  data: ApprovalList;
  tab: ApprovalsSearch['tab'];
  includeOthers: boolean;
  onTab: (tab: ApprovalsSearch['tab']) => void;
  onIncludeOthers: (include: boolean) => void;
}) {
  const showTabs =
    tab !== undefined || (data.pillars.money > 0 && data.pillars.leave > 0);
  const counts = {
    all: data.pillars.money + data.pillars.leave,
    ...data.pillars,
  };
  const showOthers = data.othersCount > 0 || includeOthers;
  if (!showTabs && !showOthers) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {showTabs ? (
        <Tabs
          value={tab ?? 'all'}
          onValueChange={(next) => {
            onTab(APPROVAL_PILLARS.find((pillar) => pillar === next));
          }}
        >
          <TabsList>
            {(['all', ...APPROVAL_PILLARS] as const).map((value) => (
              <TabsTrigger key={value} value={value}>
                {TAB_LABELS[value]}
                <Badge variant="secondary">{counts[value]}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : (
        <span />
      )}
      {showOthers ? (
        <span className="flex items-center gap-2">
          <Switch
            id="include-others"
            checked={includeOthers}
            onCheckedChange={onIncludeOthers}
          />
          <Label htmlFor="include-others">
            Include {data.othersCount} that others approve
          </Label>
        </span>
      ) : null}
    </div>
  );
}

function QueueTable({
  data,
  canAct,
  page,
  onPage,
  onApprove,
  onDecline,
}: {
  data: ApprovalList;
  canAct: boolean;
  page: number;
  onPage: (page: number) => void;
  onApprove: (item: ApprovalItem) => void;
  onDecline: (item: ApprovalItem) => void;
}) {
  return (
    <Card>
      <CardContent className="px-0">
        {data.items.length === 0 ? (
          <QueueEmpty />
        ) : (
          <ApprovalsTable
            items={data.items}
            currency={data.currency}
            canAct={canAct}
            onApprove={onApprove}
            onDecline={onDecline}
          />
        )}
        {data.total > APPROVAL_PAGE_SIZE ? (
          <NumberedPager
            page={page}
            total={data.total}
            pageSize={APPROVAL_PAGE_SIZE}
            onPage={onPage}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function DecisionDialogs({
  approving,
  declining,
  currency,
  onClose,
}: {
  approving: ApprovalItem | null;
  declining: ApprovalItem | null;
  currency: string;
  onClose: () => void;
}) {
  return (
    <>
      <ApproveDialog item={approving} currency={currency} onClose={onClose} />
      <DeclineDialog item={declining} onClose={onClose} />
    </>
  );
}

function useDecisionTargets() {
  const [approving, setApproving] = useState<ApprovalItem | null>(null);
  const [declining, setDeclining] = useState<ApprovalItem | null>(null);
  return {
    approving,
    declining,
    setApproving,
    setDeclining,
    close: () => {
      setApproving(null);
      setDeclining(null);
    },
  };
}

function Queue({
  canAct,
  search,
  onSearchChange,
}: {
  canAct: boolean;
  search: ApprovalsSearch;
  onSearchChange: (next: ApprovalsSearch) => void;
}) {
  const [page, setPage] = useState(1);
  const [includeOthers, setIncludeOthers] = useState(false);
  const targets = useDecisionTargets();
  const queue = useQuery(
    approvalsQueryOptions(useApi(), page, {
      includeOthers,
      pillar: search.tab,
    })
  );
  const lastPage = Math.ceil((queue.data?.total ?? 0) / APPROVAL_PAGE_SIZE);
  if (queue.data?.items.length === 0 && lastPage > 0 && page > lastPage) {
    setPage(lastPage);
  }
  return (
    <>
      <QueryState query={queue} skeletonClassName="h-48">
        {(data) => (
          <>
            <Toolbar
              data={data}
              tab={search.tab}
              includeOthers={includeOthers}
              onTab={(tab) => {
                setPage(1);
                onSearchChange({ tab });
              }}
              onIncludeOthers={(include) => {
                setPage(1);
                setIncludeOthers(include);
              }}
            />
            <QueueTable
              data={data}
              canAct={canAct}
              page={page}
              onPage={setPage}
              onApprove={targets.setApproving}
              onDecline={targets.setDeclining}
            />
          </>
        )}
      </QueryState>
      <DecisionDialogs
        approving={targets.approving}
        declining={targets.declining}
        currency={queue.data?.currency ?? 'NGN'}
        onClose={targets.close}
      />
    </>
  );
}

export function ApprovalsPage({
  search,
  onSearchChange,
}: {
  search: ApprovalsSearch;
  onSearchChange: (next: ApprovalsSearch) => void;
}) {
  const access = usePermissions();
  const approves =
    can(access.permissions, 'adjustment', 'approve') ||
    can(access.permissions, 'leave', 'approve');
  const staff = access.acting === null;
  if (!approves && staff) {
    return <LeaveOnlyApprovalsPage canWrite />;
  }
  return (
    <section className="flex flex-col gap-4">
      <Header />
      <Queue canAct={staff} search={search} onSearchChange={onSearchChange} />
      {staff ? <MyLeaveCard canWrite /> : null}
    </section>
  );
}
