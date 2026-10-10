import {
  createHolidaySchema,
  createSchoolYearSchema,
  daysOffQuerySchema,
  schoolYearListQuerySchema,
  termSchema,
  updateTermSchema,
} from './calendar';
import { contract } from './contract';

describe('calendar schemas', () => {
  it('defaults the school year page to the first and refuses page 0', () => {
    expect(schoolYearListQuerySchema.parse({})).toEqual({ page: 1 });
    expect(schoolYearListQuerySchema.parse({ page: '3' })).toEqual({ page: 3 });
    expect(schoolYearListQuerySchema.safeParse({ page: '0' }).success).toBe(
      false
    );
  });

  it('defaults days off to four and caps them at 200', () => {
    expect(daysOffQuerySchema.parse({})).toEqual({ limit: 4 });
    expect(daysOffQuerySchema.parse({ limit: '200' })).toEqual({ limit: 200 });
    expect(daysOffQuerySchema.safeParse({ limit: '201' }).success).toBe(false);
    expect(daysOffQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });

  it('lets a bad year name through for the service to refuse with its own message', () => {
    expect(
      createSchoolYearSchema.safeParse({
        name: '27/28',
        startsOn: '2027-09-06',
        endsOn: '2028-07-28',
      }).success
    ).toBe(true);
    expect(
      createSchoolYearSchema.safeParse({
        name: '2027/2028',
        startsOn: '6 Sep 2027',
        endsOn: '2028-07-28',
      }).success
    ).toBe(false);
  });

  it('trims a holiday name and needs one of 1 to 100 characters', () => {
    expect(
      createHolidaySchema.parse({ date: '2026-10-01', name: '  Eid  ' }).name
    ).toBe('Eid');
    const blank = createHolidaySchema.safeParse({
      date: '2026-10-01',
      name: '   ',
    });
    expect(blank.success).toBe(false);
    expect(
      createHolidaySchema.safeParse({
        date: '2026-10-01',
        name: 'x'.repeat(101),
      }).success
    ).toBe(false);
  });

  it('takes either or both dates when editing a term', () => {
    expect(updateTermSchema.parse({})).toEqual({});
    expect(updateTermSchema.parse({ endsOn: '2026-12-11' })).toEqual({
      endsOn: '2026-12-11',
    });
  });

  it('keeps a term sequence between 1 and 3', () => {
    const base = {
      id: '5b0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c11',
      schoolYearId: '5b0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c22',
      name: 'First term',
      startsOn: '2026-09-07',
      endsOn: '2026-12-11',
      isCurrent: false,
      ended: false,
      schoolDays: 70,
      holidayCount: 0,
      holidays: [],
      canMakeCurrent: false,
    };
    expect(termSchema.safeParse({ ...base, sequence: 3 }).success).toBe(true);
    expect(termSchema.safeParse({ ...base, sequence: 4 }).success).toBe(false);
  });
});

describe('calendar routes', () => {
  it('lays out the paths of the PRD API table', () => {
    expect(
      [
        contract.schoolYears.list,
        contract.schoolYears.get,
        contract.schoolYears.create,
        contract.schoolYears.remove,
        contract.terms.update,
        contract.terms.makeCurrent,
        contract.holidays.create,
        contract.holidays.remove,
        contract.calendar.current,
        contract.calendar.daysOff,
      ].map((route) => `${route.method} ${route.path}`)
    ).toEqual([
      'GET /school-years',
      'GET /school-years/:id',
      'POST /school-years',
      'DELETE /school-years/:id',
      'PATCH /terms/:id',
      'POST /terms/:id/make-current',
      'POST /terms/:id/holidays',
      'DELETE /holidays/:id',
      'GET /calendar/current',
      'GET /calendar/days-off',
    ]);
  });
});
