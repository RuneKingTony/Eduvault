import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDaysIcon } from 'lucide-react';
import type { LeaveDto } from '@eduvault/api-contract';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { invalidateLeave } from '../../queries';
import { LeaveRequestRow } from './leave-request-row';

const WITHDRAWN_TOAST = 'Request withdrawn.';

function useWithdraw() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (leave: LeaveDto) =>
      api.leave.withdraw({ params: { id: leave.id } }),
    onSuccess: async () => {
      await invalidateLeave(queryClient);
      toast.success(WITHDRAWN_TOAST);
    },
    onError: async (error) => {
      await invalidateLeave(queryClient);
      toast.error(error.message);
    },
  });
}

function NoRequests() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CalendarDaysIcon />
        </EmptyMedia>
        <EmptyTitle>No leave requests yet</EmptyTitle>
        <EmptyDescription>
          Ask for time off here. Someone with leave approval decides.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function LeaveRequestList({
  items,
  canWrite,
}: {
  items: readonly LeaveDto[];
  canWrite: boolean;
}) {
  const withdraw = useWithdraw();
  if (items.length === 0) {
    return <NoRequests />;
  }
  return (
    <ul className="flex flex-col divide-y">
      {items.map((leave) => (
        <LeaveRequestRow
          key={leave.id}
          leave={leave}
          canWithdraw={canWrite && !withdraw.isPending}
          onWithdraw={withdraw.mutate}
        />
      ))}
    </ul>
  );
}
