import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDaysIcon, PlusIcon } from 'lucide-react';
import type { MyLeave } from '@eduvault/api-contract';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@eduvault/ui';
import { useApi } from '../../api';
import { myLeaveQueryOptions } from '../../queries';
import { QueryState } from '../money/query-state';
import { LeaveStats } from './leave-stats';
import { MyLeaveBody } from './my-leave-card';
import { RequestLeaveDialog } from './request-leave-dialog';
import { SchoolHolidaysCard } from './school-holidays-card';

function Header({
  canWrite,
  onRequest,
}: {
  canWrite: boolean;
  onRequest: () => void;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1>Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Ask for leave and see what the school decides.
        </p>
      </div>
      {canWrite ? (
        <Button type="button" onClick={onRequest}>
          <PlusIcon />
          Request leave
        </Button>
      ) : null}
    </header>
  );
}

function MyLeaveSection({
  leave,
  canWrite,
}: {
  leave: MyLeave;
  canWrite: boolean;
}) {
  return (
    <>
      <LeaveStats leave={leave} />
      <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDaysIcon className="size-4" />
              My requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MyLeaveBody leave={leave} canWrite={canWrite} />
          </CardContent>
        </Card>
        <SchoolHolidaysCard holidays={leave.holidays} />
      </div>
    </>
  );
}

export function LeaveOnlyApprovalsPage({ canWrite }: { canWrite: boolean }) {
  const [requesting, setRequesting] = useState(false);
  const query = useQuery(myLeaveQueryOptions(useApi()));
  return (
    <section className="flex flex-col gap-4">
      <Header
        canWrite={canWrite}
        onRequest={() => {
          setRequesting(true);
        }}
      />
      <QueryState query={query} skeletonClassName="h-48">
        {(leave) => <MyLeaveSection leave={leave} canWrite={canWrite} />}
      </QueryState>
      <RequestLeaveDialog open={requesting} onOpenChange={setRequesting} />
    </section>
  );
}
