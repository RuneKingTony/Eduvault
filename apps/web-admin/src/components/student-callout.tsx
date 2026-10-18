import { ClockIcon, InfoIcon, UserXIcon } from 'lucide-react';
import type { StudentDetail } from '@eduvault/api-contract';
import { dueLeftOn, fmtDate, inactiveFrom, money } from '@eduvault/shared';
import { useCan } from '@eduvault/auth-client';
import { Alert, AlertAction, AlertDescription, Button } from '@eduvault/ui';

const owedSuffix = ({ balanceMinor, currency }: StudentDetail): string =>
  balanceMinor !== undefined && currency !== undefined && balanceMinor > 0
    ? ` ${money(balanceMinor, currency)} is still owed and stays in Who owes.`
    : '';

export function lifecycleMessage(student: StudentDetail): string | null {
  const { exit, notSeenSince, weeksAway } = student;
  const owed = owedSuffix(student);
  if (exit !== null) {
    const kind = exit.kind === 'left' ? 'Left' : 'Graduated';
    return `${kind} on ${fmtDate(exit.on)}. Off the roll and no longer billed; every record is kept.${owed}`;
  }
  if (notSeenSince === null) {
    return null;
  }
  if (student.dueLeft) {
    return `Not seen since ${fmtDate(notSeenSince)}, ${weeksAway} weeks ago, and inactive for more than a term. Record the leaving when you are ready.${owed}`;
  }
  if (student.life === 'inactive') {
    return `Inactive since ${fmtDate(inactiveFrom(notSeenSince))}: not seen since ${fmtDate(notSeenSince)}, and not billed for new terms. Due to be marked Left on ${fmtDate(dueLeftOn(notSeenSince))} if not back.${owed}`;
  }
  return `Not seen since ${fmtDate(notSeenSince)} (${weeksAway} weeks). Moves to Inactive on ${fmtDate(inactiveFrom(notSeenSince))} if the school hears nothing.`;
}

export function LifecycleCallout({
  student,
  onRecordLeaving,
}: {
  student: StudentDetail;
  onRecordLeaving: () => void;
}) {
  const canArchive = useCan('student', 'archive');
  const message = lifecycleMessage(student);
  if (message === null) {
    return null;
  }
  const Icon = student.exit === null ? ClockIcon : InfoIcon;
  return (
    <Alert variant={student.dueLeft ? 'destructive' : 'default'}>
      <Icon />
      <AlertDescription>{message}</AlertDescription>
      {student.dueLeft && canArchive ? (
        <AlertAction>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onRecordLeaving}
          >
            <UserXIcon />
            Record leaving
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}
