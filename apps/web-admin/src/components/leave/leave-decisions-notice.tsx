import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BellIcon } from 'lucide-react';
import type { DecidedLeaveDto, MyLeave } from '@eduvault/api-contract';
import {
  LEAVE_TYPE_LABELS,
  fmtDateRange,
  leaveDecisionAt,
  leaveReasonLine,
} from '@eduvault/shared';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  ErrorMessage,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { invalidateLeave } from '../../queries';

const decisionLine = (leave: DecidedLeaveDto): string =>
  leaveReasonLine(leave) ??
  `Approved by ${leave.deciderName}: ${LEAVE_TYPE_LABELS[leave.type]}, ${fmtDateRange(leave.startsOn, leave.endsOn)}`;

const newestDecision = (
  decisions: readonly DecidedLeaveDto[]
): string | undefined =>
  decisions
    .map((decision) => leaveDecisionAt(decision))
    .filter((at) => at !== null)
    .toSorted((a, b) => b.localeCompare(a))[0];

function useMarkSeen() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (through: string) => api.leave.seen({ body: { through } }),
    onSuccess: () => invalidateLeave(queryClient),
  });
}

export function LeaveDecisionsNotice({ leave }: { leave: MyLeave }) {
  const markSeen = useMarkSeen();
  if (leave.unseenCount === 0) {
    return null;
  }
  const more = leave.unseenCount - leave.unseenDecisions.length;
  return (
    <Alert>
      <BellIcon />
      <AlertTitle>New decisions on your leave</AlertTitle>
      <AlertDescription>
        <ul className="flex flex-col gap-0.5">
          {leave.unseenDecisions.map((decision) => (
            <li key={decision.id}>{decisionLine(decision)}</li>
          ))}
          {more > 0 ? <li>and {more} more</li> : null}
        </ul>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2"
          disabled={markSeen.isPending}
          onClick={() => {
            const through = newestDecision(leave.unseenDecisions);
            if (through !== undefined) {
              markSeen.mutate(through);
            }
          }}
        >
          Got it
        </Button>
        <ErrorMessage error={markSeen.error} />
      </AlertDescription>
    </Alert>
  );
}
