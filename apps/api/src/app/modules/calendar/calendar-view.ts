import {
  YEAR_HOLDS_CURRENT_MESSAGE,
  YEAR_STARTED_MESSAGE,
  type SchoolYear,
  type Term,
} from '@eduvault/api-contract';
import { canMakeCurrent, schoolDays } from '@eduvault/shared';
import type {
  HolidayRecord,
  SchoolYearRecord,
  SchoolYearWithTerms,
  TermRecord,
} from './calendar.repository';

export interface CalendarView {
  today: string;
  currentTerm: Pick<TermRecord, 'id' | 'sessionId'> | null;
  years: readonly SchoolYearRecord[];
  waiting?: { yearId: string; count: number } | null;
}

export const holidayDates = (holidays: readonly HolidayRecord[]): string[] =>
  holidays.map((holiday) => holiday.date);

export const termEnded = (
  term: Pick<TermRecord, 'endsOn'>,
  today: string
): boolean => term.endsOn < today;

const byDate = (a: HolidayRecord, b: HolidayRecord) =>
  a.date.localeCompare(b.date);

export function toTermView(
  term: TermRecord,
  holidays: readonly HolidayRecord[],
  view: CalendarView
): Term {
  const own = holidays
    .filter((holiday) => holiday.termId === term.id)
    .toSorted(byDate);
  return {
    id: term.id,
    schoolYearId: term.sessionId,
    sequence: term.sequence,
    name: term.name,
    startsOn: term.startsOn,
    endsOn: term.endsOn,
    isCurrent: term.isCurrent,
    ended: termEnded(term, view.today),
    schoolDays: schoolDays(term.startsOn, term.endsOn, holidayDates(own)),
    holidayCount: own.length,
    holidays: own.map((holiday) => ({ ...holiday })),
    canMakeCurrent: canMakeCurrent(term, {
      currentTerm: view.currentTerm,
      years: view.years,
    }),
  };
}

function deleteRefusal(
  year: SchoolYearWithTerms,
  today: string
): string | null {
  if (year.startsOn <= today) {
    return YEAR_STARTED_MESSAGE;
  }
  return year.terms.some((term) => term.isCurrent)
    ? YEAR_HOLDS_CURRENT_MESSAGE
    : null;
}

export function toSchoolYearView(
  year: SchoolYearWithTerms,
  holidays: readonly HolidayRecord[],
  view: CalendarView
): SchoolYear {
  const reason = deleteRefusal(year, view.today);
  return {
    id: year.id,
    name: year.name,
    startsOn: year.startsOn,
    endsOn: year.endsOn,
    terms: year.terms.map((term) => toTermView(term, holidays, view)),
    deletable: { ok: reason === null, reason },
    studentsWaiting:
      view.waiting?.yearId === year.id ? view.waiting.count : null,
  };
}
