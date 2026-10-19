import {
  LEAVE_FUTURE_MESSAGE,
  MARK_AWAY_FUTURE_MESSAGE,
  markAwayBeforeAdmittedMessage,
  type StudentLife,
} from '@eduvault/api-contract';
import {
  daysAway,
  fmtDate,
  isDueLeftByAbsence,
  isInactiveByAbsence,
} from '@eduvault/shared';

const DAYS_PER_WEEK = 7;

interface AbsenceFacts {
  notSeenSince: string | null;
  exitKind: 'left' | 'graduated' | null;
  today: string;
}

export interface LifecycleFacts extends AbsenceFacts {
  newInCurrentSession: boolean;
}

export function lifeOf(facts: AbsenceFacts): StudentLife {
  if (facts.exitKind !== null) {
    return facts.exitKind;
  }
  return isInactiveByAbsence(facts.notSeenSince, facts.today)
    ? 'inactive'
    : 'active';
}

export const isDueToBeLeft = (facts: AbsenceFacts): boolean =>
  lifeOf(facts) === 'inactive' &&
  isDueLeftByAbsence(facts.notSeenSince, facts.today);

export const isNewIntake = (facts: LifecycleFacts): boolean =>
  lifeOf(facts) === 'active' && facts.newInCurrentSession;

export function weeksAway(facts: AbsenceFacts): number | null {
  return facts.notSeenSince === null
    ? null
    : Math.floor(
        Math.max(daysAway(facts.notSeenSince, facts.today), 0) / DAYS_PER_WEEK
      );
}

interface MarkAwayDateFacts {
  date: string;
  today: string;
  admittedOn: string;
}

export function markAwayDateError(facts: MarkAwayDateFacts): string | null {
  if (facts.date > facts.today) {
    return MARK_AWAY_FUTURE_MESSAGE;
  }
  return facts.date < facts.admittedOn
    ? markAwayBeforeAdmittedMessage(fmtDate(facts.admittedOn))
    : null;
}

export const leaveDateError = (
  lastDay: string,
  today: string
): string | null => (lastDay > today ? LEAVE_FUTURE_MESSAGE : null);

interface UndoFacts {
  exitKind: 'left' | 'graduated' | null;
  archivedTermId: string | null;
  currentTermId: string | null;
}

export const canUndoLeaving = (facts: UndoFacts): boolean =>
  facts.exitKind !== null &&
  facts.archivedTermId !== null &&
  facts.archivedTermId === facts.currentTermId;
