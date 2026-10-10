import type {
  CalendarCurrent,
  Holiday,
  SchoolYear,
  Term,
} from '@eduvault/api-contract';

const holiday = (overrides: Partial<Holiday> = {}): Holiday => ({
  id: 'h1',
  termId: 't1',
  date: '2026-10-01',
  name: 'Independence Day',
  ...overrides,
});

export const term = (overrides: Partial<Term> = {}): Term => ({
  id: 't1',
  schoolYearId: 'y1',
  sequence: 1,
  name: 'First term',
  startsOn: '2026-09-07',
  endsOn: '2026-12-11',
  isCurrent: false,
  ended: false,
  schoolDays: 70,
  holidayCount: 0,
  holidays: [],
  canMakeCurrent: false,
  ...overrides,
});

export const schoolYear = (
  overrides: Partial<SchoolYear> = {}
): SchoolYear => ({
  id: 'y1',
  name: '2026/2027',
  startsOn: '2026-09-07',
  endsOn: '2027-07-23',
  terms: [],
  deletable: { ok: true, reason: null },
  studentsWaiting: null,
  ...overrides,
});

const STARTED = 'A school year that has already started cannot be deleted.';

export const currentYear = (): SchoolYear =>
  schoolYear({
    deletable: { ok: false, reason: STARTED },
    terms: [
      term({
        isCurrent: true,
        schoolDays: 67,
        holidayCount: 3,
        holidays: [
          holiday(),
          holiday({ id: 'h2', date: '2026-10-29', name: 'Mid-term break' }),
          holiday({ id: 'h3', date: '2026-10-30', name: 'Mid-term break' }),
        ],
      }),
      term({
        id: 't2',
        sequence: 2,
        name: 'Second term',
        startsOn: '2027-01-04',
        endsOn: '2027-03-26',
        schoolDays: 60,
        canMakeCurrent: true,
      }),
      term({
        id: 't3',
        sequence: 3,
        name: 'Third term',
        startsOn: '2027-04-19',
        endsOn: '2027-07-23',
        schoolDays: 70,
        canMakeCurrent: true,
      }),
    ],
  });

export const nextYear = (overrides: Partial<SchoolYear> = {}): SchoolYear =>
  schoolYear({
    id: 'y2',
    name: '2027/2028',
    startsOn: '2027-09-06',
    endsOn: '2028-07-28',
    terms: [
      term({
        id: 't4',
        schoolYearId: 'y2',
        startsOn: '2027-09-06',
        endsOn: '2027-12-10',
        canMakeCurrent: true,
      }),
      term({
        id: 't5',
        schoolYearId: 'y2',
        sequence: 2,
        name: 'Second term',
        startsOn: '2028-01-03',
        endsOn: '2028-03-31',
      }),
      term({
        id: 't6',
        schoolYearId: 'y2',
        sequence: 3,
        name: 'Third term',
        startsOn: '2028-04-24',
        endsOn: '2028-07-28',
      }),
    ],
    ...overrides,
  });

export const currentCalendar = (): CalendarCurrent => {
  const year = currentYear();
  return {
    term: year.terms[0] ?? null,
    schoolYear: {
      id: year.id,
      name: year.name,
      startsOn: year.startsOn,
      endsOn: year.endsOn,
    },
    schoolDays: 67,
    schoolDaysSoFar: 22,
  };
};

export const noCalendar = (): CalendarCurrent => ({
  term: null,
  schoolYear: null,
  schoolDays: 0,
  schoolDaysSoFar: 0,
});
