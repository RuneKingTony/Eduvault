import type { CalendarCurrent, RosterRow } from '@eduvault/api-contract';
import { countOf } from '@eduvault/shared';

const LAST_TERM = 3;

const lastWord = (name: string): string =>
  name.trim().split(/\s+/).at(-1) ?? name;

export const byLastName = (roster: readonly RosterRow[]): RosterRow[] =>
  roster.toSorted(
    (a, b) =>
      lastWord(a.name).localeCompare(lastWord(b.name)) ||
      a.name.localeCompare(b.name)
  );

export const needsEarlyConfirmation = (
  current: CalendarCurrent | undefined
): boolean => {
  const sequence = current?.term?.sequence;
  return sequence === undefined || sequence < LAST_TERM;
};

export const graduatedToast = (graduated: number): string =>
  `${countOf(graduated, 'student', 'students')} graduated.`;

export function earlyConfirmText(current: CalendarCurrent | undefined): string {
  const leaves = `Graduates leave the roll today and won’t be billed for the rest of ${current?.schoolYear?.name ?? 'the school year'}.`;
  const term = current?.term?.name;
  return term === undefined ? leaves : `It is still ${term}. ${leaves}`;
}
