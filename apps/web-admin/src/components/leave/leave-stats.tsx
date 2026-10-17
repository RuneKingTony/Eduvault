import type { MyLeave } from '@eduvault/api-contract';
import { LEAVE_TYPE_LABELS, fmtDate, leaveDaysText } from '@eduvault/shared';
import { StatCard } from '../dashboard/dashboard-stat';

const daysSub = (leave: MyLeave): string =>
  leave.schoolYearLabel === null
    ? 'Approved leave this year'
    : `Approved leave in ${leave.schoolYearLabel}`;

const waitingSub = (leave: MyLeave): string =>
  leave.oldestWaitingSentOn === null
    ? 'Nothing waiting'
    : `Oldest sent ${fmtDate(leave.oldestWaitingSentOn)}`;

function NextTile({ leave }: { leave: MyLeave }) {
  const next = leave.nextTimeOff;
  return (
    <StatCard
      label="Next time off"
      value={next === null ? '—' : fmtDate(next.startsOn)}
      sub={
        next === null
          ? 'No approved leave ahead'
          : `${LEAVE_TYPE_LABELS[next.type]} · ${leaveDaysText(next.days)}`
      }
    />
  );
}

export function LeaveStats({ leave }: { leave: MyLeave }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard
        label="Days taken"
        value={String(leave.daysTakenThisYear)}
        sub={daysSub(leave)}
      />
      <StatCard
        label="Waiting"
        value={String(leave.waiting)}
        sub={waitingSub(leave)}
      />
      <NextTile leave={leave} />
    </div>
  );
}
