import type { SchoolYear, Term } from '@eduvault/api-contract';
import { countOf, fmtDate } from '@eduvault/shared';

export const schoolDaysText = (days: number): string =>
  countOf(days, 'school day', 'school days');

export const termTitle = (
  term: Pick<Term, 'name'>,
  year: Pick<SchoolYear, 'name'>
): string => `${term.name}, ${year.name}`;

export interface TermInYear {
  term: Term;
  year: SchoolYear;
}

export function findTerm(
  years: readonly SchoolYear[],
  termId: string | null
): TermInYear | undefined {
  for (const year of years) {
    const term = year.terms.find((candidate) => candidate.id === termId);
    if (term !== undefined) {
      return { term, year };
    }
  }
  return undefined;
}

export const holidayListText = (term: Term): string =>
  term.holidays
    .map((holiday) => `${fmtDate(holiday.date)} ${holiday.name}`)
    .join(' · ');
