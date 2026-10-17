import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDaysIcon, PlusIcon } from 'lucide-react';
import type { MyLeave } from '@eduvault/api-contract';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@eduvault/ui';
import { countOf, leaveDaysText } from '@eduvault/shared';
import { useApi } from '../../api';
import { myLeaveQueryOptions } from '../../queries';
import { QueryState } from '../money/query-state';
import { LeaveRequestList } from './leave-request-list';
import { NoApproverCallout } from './no-approver-callout';
import { RequestLeaveDialog } from './request-leave-dialog';

function Figures({ leave }: { leave: MyLeave }) {
  return (
    <p className="text-sm text-muted-foreground">
      {leaveDaysText(leave.daysTakenThisYear)} taken this year · {leave.waiting}{' '}
      waiting for a decision ·{' '}
      {countOf(leave.items.length, 'request', 'requests')} in total
    </p>
  );
}

export function MyLeaveBody({
  leave,
  canWrite,
}: {
  leave: MyLeave;
  canWrite: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {leave.otherApproverExists ? null : <NoApproverCallout />}
      <LeaveRequestList items={leave.items} canWrite={canWrite} />
    </div>
  );
}

export function MyLeaveCard({ canWrite }: { canWrite: boolean }) {
  const [requesting, setRequesting] = useState(false);
  const query = useQuery(myLeaveQueryOptions(useApi()));
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2">
            <CalendarDaysIcon className="size-4" />
            My leave
          </CardTitle>
          {query.data === undefined ? null : <Figures leave={query.data} />}
        </div>
        {canWrite ? (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setRequesting(true);
            }}
          >
            <PlusIcon />
            Request leave
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        <QueryState query={query} skeletonClassName="h-24">
          {(leave) => <MyLeaveBody leave={leave} canWrite={canWrite} />}
        </QueryState>
      </CardContent>
      <RequestLeaveDialog open={requesting} onOpenChange={setRequesting} />
    </Card>
  );
}
