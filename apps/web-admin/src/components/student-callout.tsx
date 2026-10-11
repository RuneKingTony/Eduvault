import { ClockIcon, InfoIcon } from 'lucide-react';
import type { StudentDetail } from '@eduvault/api-contract';
import { dueLeftOn, fmtDate, inactiveFrom } from '@eduvault/shared';
import { Alert, AlertDescription } from '@eduvault/ui';

function lifecycleMessage(student: StudentDetail): string | null {
  const { exit, notSeenSince, weeksAway } = student;
  if (exit !== null) {
    const kind = exit.kind === 'left' ? 'Left' : 'Graduated';
    return `${kind} on ${fmtDate(exit.on)}. Off the roll and no longer billed; every record is kept.`;
  }
  if (notSeenSince === null) {
    return null;
  }
  if (student.dueLeft) {
    return `Not seen since ${fmtDate(notSeenSince)}, ${weeksAway} weeks ago, and inactive for more than a term. Record the leaving when you are ready.`;
  }
  if (student.life === 'inactive') {
    return `Inactive since ${fmtDate(inactiveFrom(notSeenSince))}: not seen since ${fmtDate(notSeenSince)}, and not billed for new terms. Due to be marked Left on ${fmtDate(dueLeftOn(notSeenSince))} if not back.`;
  }
  return `Not seen since ${fmtDate(notSeenSince)} (${weeksAway} weeks). Moves to Inactive on ${fmtDate(inactiveFrom(notSeenSince))} if the school hears nothing.`;
}

export function LifecycleCallout({ student }: { student: StudentDetail }) {
  const message = lifecycleMessage(student);
  if (message === null) {
    return null;
  }
  const Icon = student.exit === null ? ClockIcon : InfoIcon;
  return (
    <Alert variant={student.dueLeft ? 'destructive' : 'default'}>
      <Icon />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
