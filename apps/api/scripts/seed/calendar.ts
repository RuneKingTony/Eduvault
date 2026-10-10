import type { INestApplicationContext } from '@nestjs/common';
import type { CreatedSchoolYear } from '@eduvault/api-contract';
import type { OrgContext } from '../../src/app/common/auth';
import { Clock } from '../../src/app/common/clock';
import { CalendarService } from '../../src/app/modules/calendar/calendar.service';
import { shiftDate } from './date-shift';

interface SeedHoliday {
  term: 1 | 2 | 3;
  date: string;
  name: string;
}

// Greenfield's 2026/2027 holidays as prototype dates; shiftDate moves them with the seed's today.
const HOLIDAYS: readonly SeedHoliday[] = [
  { term: 1, date: '2026-10-01', name: 'Independence Day' },
  { term: 1, date: '2026-10-29', name: 'Mid-term break' },
  { term: 1, date: '2026-10-30', name: 'Mid-term break' },
  { term: 2, date: '2027-02-18', name: 'Mid-term break' },
  { term: 2, date: '2027-02-19', name: 'Mid-term break' },
  { term: 2, date: '2027-03-10', name: 'Eid al-Fitr' },
  { term: 2, date: '2027-03-11', name: 'Eid al-Fitr' },
  { term: 2, date: '2027-03-26', name: 'Good Friday' },
  { term: 2, date: '2027-03-29', name: 'Easter Monday' },
  { term: 3, date: '2027-05-17', name: 'Eid al-Adha' },
  { term: 3, date: '2027-05-27', name: 'Children’s Day' },
];

const yearName = (startsOn: string): string => {
  const year = Number(startsOn.slice(0, 4));
  return `${year}/${year + 1}`;
};

const termId = (year: CreatedSchoolYear, sequence: number): string => {
  const term = year.terms.find((candidate) => candidate.sequence === sequence);
  if (term === undefined) {
    throw new Error(`Seeded year ${year.name} has no term ${sequence}`);
  }
  return term.id;
};

export async function seedCalendar(
  app: INestApplicationContext,
  options: { owner: OrgContext; today: string; offsetDays: number }
): Promise<void> {
  const { owner, today, offsetDays } = options;
  const calendar = app.get(CalendarService, { strict: false });
  const clock = app.get(Clock, { strict: false });
  const shift = (date: string) => shiftDate(date, offsetDays);
  const newYear = (startsOn: string, endsOn: string) => ({
    name: yearName(shift(startsOn)),
    startsOn: shift(startsOn),
    endsOn: shift(endsOn),
  });

  clock.set(today);
  try {
    const previous = await calendar.create(
      owner,
      newYear('2025-09-08', '2026-07-24')
    );
    const year = await calendar.create(
      owner,
      newYear('2026-09-07', '2027-07-23')
    );
    await calendar.makeCurrent(owner, termId(previous, 3));
    await calendar.makeCurrent(owner, termId(year, 1));
    await calendar.updateTerm(owner, termId(year, 2), {
      startsOn: shift('2027-01-11'),
      endsOn: shift('2027-04-02'),
    });
    for (const holiday of HOLIDAYS) {
      await calendar.addHoliday(owner, termId(year, holiday.term), {
        date: shift(holiday.date),
        name: holiday.name,
      });
    }
  } finally {
    clock.set(null);
  }
}
