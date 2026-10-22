import type {
  LeavingReason,
  PlacementClass,
  StudentDetail,
  StudentLife,
} from '@eduvault/api-contract';
import {
  addDays,
  fmtDate,
  inactiveFrom,
  isInactiveByAbsence,
} from '@eduvault/shared';

const NOT_SEEN_DEFAULT_DAYS_AGO = 7;

export const defaultNotSeenDate = (today: string): string =>
  addDays(today, -NOT_SEEN_DEFAULT_DAYS_AGO);

export const defaultLeaveReason = (life: StudentLife): LeavingReason =>
  life === 'inactive' ? 'did_not_return' : 'relocated';

export const defaultLastDay = (
  student: Pick<StudentDetail, 'notSeenSince'>,
  today: string
): string => student.notSeenSince ?? today;

export type StudentAction = 'move' | 'mark-away' | 'back' | 'leave' | 'undo';

interface MenuCaps {
  place: boolean;
  markAway: boolean;
  archive: boolean;
}

export interface MenuItem {
  action: StudentAction;
  label: string;
  destructive?: boolean;
}

interface MenuRule {
  action: StudentAction;
  label: (student: StudentDetail) => string;
  destructive?: boolean;
  shown: (student: StudentDetail, caps: MenuCaps) => boolean;
}

const onRoll = (student: StudentDetail) => student.exit === null;
const marked = (student: StudentDetail) => student.notSeenSince !== null;

const MENU_RULES: readonly MenuRule[] = [
  {
    action: 'move',
    label: () => 'Move for next term',
    shown: (student, caps) => caps.place && student.canMoveForNextTerm,
  },
  {
    action: 'mark-away',
    label: () => 'Mark not seen since…',
    shown: (student, caps) =>
      caps.markAway && onRoll(student) && !marked(student),
  },
  {
    action: 'back',
    label: (student) =>
      student.life === 'inactive'
        ? 'Reactivate: back in school'
        : 'Back in school',
    shown: (student, caps) =>
      caps.markAway && onRoll(student) && marked(student),
  },
  {
    action: 'leave',
    label: () => 'Record leaving…',
    destructive: true,
    shown: (student, caps) => caps.archive && onRoll(student),
  },
  {
    action: 'undo',
    label: (student) =>
      student.exit?.kind === 'graduated' ? 'Undo graduation…' : 'Undo leaving…',
    shown: (student, caps) => caps.archive && student.canUndoLeaving,
  },
];

export function menuItems(student: StudentDetail, caps: MenuCaps): MenuItem[] {
  return MENU_RULES.filter((rule) => rule.shown(student, caps)).map((rule) => ({
    action: rule.action,
    label: rule.label(student),
    ...(rule.destructive === true ? { destructive: true } : {}),
  }));
}

interface Toast {
  kind: 'success' | 'warning';
  text: string;
}

export function markAwayToast(
  student: Pick<StudentDetail, 'firstName'>,
  input: { date: string; today: string }
): Toast {
  if (isInactiveByAbsence(input.date, input.today)) {
    return {
      kind: 'warning',
      text: `Over 5 weeks away, so ${student.firstName} is now Inactive and won’t be billed for new terms.`,
    };
  }
  return {
    kind: 'success',
    text: `Saved. ${student.firstName} becomes Inactive on ${fmtDate(inactiveFrom(input.date))} if the school hears nothing.`,
  };
}

export const backInSchoolToast = (
  student: Pick<StudentDetail, 'firstName' | 'life'>
): string =>
  student.life === 'inactive'
    ? `${student.firstName} is Active again and will be billed from the next charge run.`
    : `${student.firstName} is marked as back in school.`;

export const classOptionLabel = (row: PlacementClass): string =>
  `${row.name} · ${row.campus.name}`;

export function defaultMoveClass(
  student: StudentDetail,
  options: readonly PlacementClass[]
): string {
  const current = options.find(
    (row) => row.id === student.currentPlacement?.armId
  );
  return (current ?? options[0])?.id ?? '';
}

export const leavesScope = (
  campusId: string,
  campusScope: 'all' | readonly string[]
): boolean => campusScope !== 'all' && !campusScope.includes(campusId);
