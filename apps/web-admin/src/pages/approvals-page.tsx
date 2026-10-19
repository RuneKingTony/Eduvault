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
  Button,
  CampusSelect,
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
import { approvalsQueryOptions, campusesQueryOptions } from '../queries';

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

function PillarTabs({
  data,
  tab,
  onTab,
}: {
  data: ApprovalList;
  tab: ApprovalsSearch['tab'];
  onTab: (tab: ApprovalsSearch['tab']) => void;
}) {
  const counts = {
    all: data.pillars.money + data.pillars.leave,
    ...data.pillars,
  };
  return (
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
  );
}

function Toolbar({
  data,
  tab,
  campus,
  campuses,
  includeOthers,
  onTab,
  onCampus,
  onIncludeOthers,
}: {
  data: ApprovalList;
  tab: ApprovalsSearch['tab'];
  campus: ApprovalsSearch['campus'];
  campuses: readonly { id: string; name: string }[];
  includeOthers: boolean;
  onTab: (tab: ApprovalsSearch['tab']) => void;
  onCampus: (campus: ApprovalsSearch['campus']) => void;
  onIncludeOthers: (include: boolean) => void;
}) {
  const showTabs =
    tab !== undefined || (data.pillars.money > 0 && data.pillars.leave > 0);
  const showOthers = data.othersCount > 0 || includeOthers;
  if (!showTabs && !showOthers && campuses.length <= 1) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {showTabs ? <PillarTabs data={data} tab={tab} onTab={onTab} /> : <span />}
      <div className="flex flex-wrap items-center gap-3">
        <CampusSelect campuses={campuses} value={campus} onChange={onCampus} />
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

function useFilterPage(filter: string) {
  const [paged, setPaged] = useState({ filter, page: 1 });
  return [
    paged.filter === filter ? paged.page : 1,
    (page: number) => {
      setPaged({ filter, page });
    },
  ] as const;
}

function useApprovalsQueue(
  search: ApprovalsSearch,
  onSearchChange: (next: ApprovalsSearch) => void
) {
  const api = useApi();
  const [includeOthers, setIncludeOthers] = useState(false);
  const [page, setPage] = useFilterPage(
    `${search.tab ?? ''}|${search.campus ?? ''}|${includeOthers}`
  );
  const campuses = useQuery(campusesQueryOptions(api)).data ?? [];
  const queue = useQuery(
    approvalsQueryOptions(api, page, {
      includeOthers,
      pillar: search.tab,
      campusId: search.campus,
    })
  );
  const lastPage = Math.ceil((queue.data?.total ?? 0) / APPROVAL_PAGE_SIZE);
  if (queue.data?.items.length === 0 && lastPage > 0 && page > lastPage) {
    setPage(lastPage);
  }
  return {
    page,
    setPage,
    includeOthers,
    setIncludeOthers,
    campuses,
    queue,
    pickTab: (tab: ApprovalsSearch['tab']) => {
      setPage(1);
      onSearchChange({ ...search, tab });
    },
    pickCampus: (campus: ApprovalsSearch['campus']) => {
      setPage(1);
      onSearchChange({ ...search, campus });
    },
  };
}

function CampusRecovery({
  failed,
  campuses,
  value,
  onChange,
}: {
  failed: boolean;
  campuses: readonly { id: string; name: string }[];
  value: ApprovalsSearch['campus'];
  onChange: (campus: ApprovalsSearch['campus']) => void;
}) {
  if (!failed || value === undefined) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <CampusSelect campuses={campuses} value={value} onChange={onChange} />
      <Button
        variant="outline"
        onClick={() => {
          onChange(undefined);
        }}
      >
        Show all campuses
      </Button>
    </div>
  );
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
  const view = useApprovalsQueue(search, onSearchChange);
  const targets = useDecisionTargets();
  return (
    <>
      <CampusRecovery
        failed={view.queue.isError && view.queue.data === undefined}
        campuses={view.campuses}
        value={search.campus}
        onChange={view.pickCampus}
      />
      <QueryState query={view.queue} skeletonClassName="h-48">
        {(data) => (
          <>
            <Toolbar
              data={data}
              tab={search.tab}
              campus={search.campus}
              campuses={view.campuses}
              includeOthers={view.includeOthers}
              onTab={view.pickTab}
              onCampus={view.pickCampus}
              onIncludeOthers={(include) => {
                view.setPage(1);
                view.setIncludeOthers(include);
              }}
            />
            <QueueTable
              data={data}
              canAct={canAct && !view.queue.isPlaceholderData}
              page={view.page}
              onPage={view.setPage}
              onApprove={targets.setApproving}
              onDecline={targets.setDeclining}
            />
          </>
        )}
      </QueryState>
      <DecisionDialogs
        approving={targets.approving}
        declining={targets.declining}
        currency={view.queue.data?.currency ?? 'NGN'}
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
  const canDecide = access.acting === null || access.acting.writes;
  if (!approves && staff) {
    return <LeaveOnlyApprovalsPage canWrite />;
  }
  return (
    <section className="flex flex-col gap-4">
      <Header />
      <Queue
        canAct={canDecide}
        search={search}
        onSearchChange={onSearchChange}
      />
      {staff ? <MyLeaveCard canWrite /> : null}
    </section>
  );
}
