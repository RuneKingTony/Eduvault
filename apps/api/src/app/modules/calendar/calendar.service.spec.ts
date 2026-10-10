import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import type { SchoolLock } from '../../common/db/school-lock';
import {
  CalendarRepository,
  type HolidayRecord,
  type NewYearInsert,
  type SchoolYearRecord,
  type SchoolYearWithTerms,
  type TermDetail,
  type TermRecord,
} from './calendar.repository';
import { CalendarService } from './calendar.service';

const ORG = 'school-a';

const ctx = { organizationId: ORG } as OrgContext;

class FakeCalendar extends CalendarRepository {
  years: SchoolYearRecord[] = [];
  terms: TermRecord[] = [];
  holidays: HolidayRecord[] = [];
  referenced = false;
  private counter = 0;

  private id(prefix: string) {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  private withTerms(year: SchoolYearRecord): SchoolYearWithTerms {
    return {
      ...year,
      terms: this.terms
        .filter((term) => term.sessionId === year.id)
        .toSorted((a, b) => a.sequence - b.sequence),
    };
  }

  listYears(_org: string, page: { offset: number; limit: number }) {
    const ordered = this.years.toSorted((a, b) =>
      b.startsOn.localeCompare(a.startsOn)
    );
    return Promise.resolve({
      items: ordered
        .slice(page.offset, page.offset + page.limit)
        .map((year) => this.withTerms(year)),
      total: ordered.length,
    });
  }

  listYearRanges() {
    return Promise.resolve(this.years);
  }

  findYear(_org: string, id: string) {
    const year = this.years.find((candidate) => candidate.id === id);
    return Promise.resolve(year && this.withTerms(year));
  }

  findYearByName(_org: string, name: string) {
    return Promise.resolve(this.years.find((year) => year.name === name));
  }

  overlapsYear(_org: string, startsOn: string, endsOn: string) {
    return Promise.resolve(
      this.years.some(
        (year) => year.startsOn <= endsOn && startsOn <= year.endsOn
      )
    );
  }

  findTerm(_org: string, id: string): Promise<TermDetail | undefined> {
    const term = this.terms.find((candidate) => candidate.id === id);
    const year = this.years.find(
      (candidate) => candidate.id === term?.sessionId
    );
    if (term === undefined || year === undefined) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve({
      term,
      year,
      siblings: this.terms.filter(
        (sibling) => sibling.sessionId === year.id && sibling.id !== id
      ),
    });
  }

  findCurrentTerm() {
    const term = this.terms.find((candidate) => candidate.isCurrent);
    const year = this.years.find(
      (candidate) => candidate.id === term?.sessionId
    );
    return Promise.resolve(term && year ? { term, year } : undefined);
  }

  listTerms() {
    return Promise.resolve(this.terms);
  }

  holidaysByTerms(_org: string, termIds: readonly string[]) {
    return Promise.resolve(
      this.holidays.filter((holiday) => termIds.includes(holiday.termId))
    );
  }

  listHolidays() {
    return Promise.resolve(this.holidays);
  }

  findHoliday(_org: string, id: string) {
    return Promise.resolve(this.holidays.find((holiday) => holiday.id === id));
  }

  findHolidayByDate(_org: string, date: string) {
    return Promise.resolve(
      this.holidays.find((holiday) => holiday.date === date)
    );
  }

  insertYear(_org: string, input: NewYearInsert) {
    const year = { id: this.id('year'), ...input.year };
    this.years.push(year);
    for (const term of input.terms) {
      this.terms.push({
        id: this.id('term'),
        sessionId: year.id,
        isCurrent: input.firstTermCurrent && term.sequence === 1,
        ...term,
      });
    }
    return Promise.resolve(year.id);
  }

  setCurrent(_org: string, termId: string) {
    for (const term of this.terms) {
      term.isCurrent = term.id === termId;
    }
    return Promise.resolve();
  }

  updateTermDates(
    _org: string,
    termId: string,
    dates: { startsOn: string; endsOn: string }
  ) {
    Object.assign(this.terms.find((term) => term.id === termId) ?? {}, dates);
    return Promise.resolve();
  }

  insertHoliday(
    _org: string,
    termId: string,
    holiday: { date: string; name: string }
  ) {
    const created = { id: this.id('holiday'), termId, ...holiday };
    this.holidays.push(created);
    return Promise.resolve(created);
  }

  deleteHoliday(_org: string, id: string) {
    this.holidays = this.holidays.filter((holiday) => holiday.id !== id);
    return Promise.resolve();
  }

  deleteYear(_org: string, id: string) {
    if (this.referenced) {
      return Promise.resolve('referenced' as const);
    }
    this.years = this.years.filter((year) => year.id !== id);
    this.terms = this.terms.filter((term) => term.sessionId !== id);
    return Promise.resolve('deleted' as const);
  }
}

const setup = (today = '2026-10-07') => {
  const repository = new FakeCalendar();
  const clock = new Clock();
  clock.set(today);
  const lock = { run: (_org: string, fn: () => Promise<unknown>) => fn() };
  const service = new CalendarService(
    repository,
    clock,
    lock as unknown as SchoolLock
  );
  return { repository, clock, service };
};

const current = {
  name: '2026/2027',
  startsOn: '2026-09-07',
  endsOn: '2027-07-23',
};
const next = {
  name: '2027/2028',
  startsOn: '2027-09-06',
  endsOn: '2028-07-28',
};

const withYear = async (year = current, today?: string) => {
  const world = setup(today);
  const created = await world.service.create(ctx, year);
  return { ...world, created };
};

const termOf = (
  created: { terms: { id: string; sequence: number }[] },
  sequence: number
) => {
  const found = created.terms.find((term) => term.sequence === sequence);
  if (found === undefined) {
    throw new Error(`no term ${sequence}`);
  }
  return found.id;
};

describe('CalendarService.create', () => {
  it('splits three terms and makes the first one current for a first year', async () => {
    const { created } = await withYear();
    expect(created.madeCurrent).toBe(true);
    expect(created.terms.map((term) => term.isCurrent)).toEqual([
      true,
      false,
      false,
    ]);
    expect(created.terms[0]).toMatchObject({
      startsOn: '2026-09-07',
      endsOn: '2026-12-11',
      schoolDays: 70,
    });
  });

  it('leaves the current term alone for a second year', async () => {
    const { service, created } = await withYear();
    const second = await service.create(ctx, next);
    expect(second.madeCurrent).toBe(false);
    expect(second.terms.every((term) => !term.isCurrent)).toBe(true);
    const page = await service.list(ctx, 1);
    expect(page.items.map((year) => year.name)).toEqual([
      '2027/2028',
      '2026/2027',
    ]);
    expect(page.items[1]?.terms[0]?.id).toBe(created.terms[0]?.id);
  });

  it.each([
    [
      '2027/2029',
      'Write the year as two years in a row, for example 2028/2029.',
    ],
    ['27/28', 'Write the year as two years in a row, for example 2028/2029.'],
  ])('refuses the name %s', async (name, message) => {
    const { service } = setup();
    await expect(service.create(ctx, { ...next, name })).rejects.toThrow(
      new BadRequestException(message)
    );
  });

  it('refuses a name before it looks at the dates', async () => {
    const { service } = await withYear();
    await expect(
      service.create(ctx, {
        name: '2026/2027',
        startsOn: '2030-01-01',
        endsOn: '2029-01-01',
      })
    ).rejects.toThrow(new ConflictException('2026/2027 already exists.'));
  });

  it('refuses an end that is not after the start, then a year under 84 days', async () => {
    const { service } = setup();
    await expect(
      service.create(ctx, { ...next, endsOn: next.startsOn })
    ).rejects.toThrow(
      new BadRequestException(
        'Choose valid dates: the end must be after the start.'
      )
    );
    await expect(
      service.create(ctx, { ...next, endsOn: '2027-11-28' })
    ).rejects.toThrow(
      new BadRequestException('A school year needs at least 12 weeks.')
    );
    await expect(
      service.create(ctx, { ...next, endsOn: '2027-11-29' })
    ).resolves.toMatchObject({ name: '2027/2028' });
  });

  it('refuses dates that overlap another year', async () => {
    const { service } = await withYear();
    await expect(
      service.create(ctx, {
        name: '2027/2028',
        startsOn: '2027-07-01',
        endsOn: '2028-07-28',
      })
    ).rejects.toThrow(
      new ConflictException('These dates overlap another school year.')
    );
  });
});

describe('CalendarService.makeCurrent', () => {
  it('moves the current flag within the year and keeps one current term', async () => {
    const { service, repository, created } = await withYear();
    const second = await service.makeCurrent(ctx, termOf(created, 2));
    expect(second.isCurrent).toBe(true);
    expect(repository.terms.filter((term) => term.isCurrent)).toHaveLength(1);
  });

  it('returns a term that is already current unchanged', async () => {
    const { service, created } = await withYear();
    await expect(
      service.makeCurrent(ctx, termOf(created, 1))
    ).resolves.toMatchObject({ isCurrent: true });
  });

  it("offers next year's first term but refuses its other terms", async () => {
    const { service, created } = await withYear();
    const later = await service.create(ctx, next);
    await expect(service.makeCurrent(ctx, termOf(later, 2))).rejects.toThrow(
      new ConflictException(
        'Only a term of this school year, or the first term of the next one, can be made current.'
      )
    );
    expect(created.terms[1]?.canMakeCurrent).toBe(true);
    await expect(
      service.makeCurrent(ctx, termOf(later, 1))
    ).resolves.toMatchObject({ isCurrent: true, schoolYearId: later.id });
  });

  it('answers 404 for a term outside the school', async () => {
    const { service } = setup();
    await expect(service.makeCurrent(ctx, 'nope')).rejects.toThrow(
      NotFoundException
    );
  });
});

describe('CalendarService.updateTerm', () => {
  it('refuses an ended term with a 409 before any other check', async () => {
    const { service, created } = await withYear(current, '2026-12-14');
    await expect(
      service.updateTerm(ctx, termOf(created, 1), {
        startsOn: '2026-12-31',
        endsOn: '2026-01-01',
      })
    ).rejects.toThrow(
      new ConflictException(
        'This term has already ended, so its dates can’t change.'
      )
    );
  });

  it('refuses an end before the start, then dates outside the year', async () => {
    const { service, created } = await withYear();
    const second = termOf(created, 2);
    await expect(
      service.updateTerm(ctx, second, {
        startsOn: '2027-03-01',
        endsOn: '2027-02-01',
      })
    ).rejects.toThrow(
      new BadRequestException(
        'Choose valid dates: the end must be after the start.'
      )
    );
    await expect(
      service.updateTerm(ctx, second, { startsOn: '2026-09-01' })
    ).rejects.toThrow(
      new BadRequestException(
        'Keep the term inside 2026/2027: 7 Sep 2026 – 23 Jul 2027.'
      )
    );
  });

  it('names the sibling a new date range overlaps', async () => {
    const { service, created } = await withYear();
    await expect(
      service.updateTerm(ctx, termOf(created, 2), { endsOn: '2027-04-23' })
    ).rejects.toThrow(
      new BadRequestException('These dates overlap Third term.')
    );
    await expect(
      service.updateTerm(ctx, termOf(created, 2), { startsOn: '2026-12-11' })
    ).rejects.toThrow(
      new BadRequestException('These dates overlap First term.')
    );
  });

  it('refuses to strand a holiday outside the new dates', async () => {
    const { service, created } = await withYear();
    const first = termOf(created, 1);
    await service.addHoliday(ctx, first, {
      date: '2026-10-29',
      name: 'Mid-term break',
    });
    await expect(
      service.updateTerm(ctx, first, { startsOn: '2026-11-02' })
    ).rejects.toThrow(
      new BadRequestException(
        '29 Oct 2026 is a holiday in this term that would fall outside it. Remove the holiday first.'
      )
    );
  });

  it('saves dates and recounts school days', async () => {
    const { service, created } = await withYear();
    const second = await service.updateTerm(ctx, termOf(created, 2), {
      startsOn: '2027-01-11',
    });
    expect(second).toMatchObject({ startsOn: '2027-01-11', schoolDays: 55 });
  });
});

describe('CalendarService holidays', () => {
  it('adds a weekday holiday and returns the new count', async () => {
    const { service, created } = await withYear();
    const added = await service.addHoliday(ctx, termOf(created, 1), {
      date: '2026-10-01',
      name: '  Independence Day ',
    });
    expect(added.holiday.name).toBe('Independence Day');
    expect(added.term).toMatchObject({ schoolDays: 69, holidayCount: 1 });
  });

  it('refuses a past term, a date outside, a weekend and a taken date in that order', async () => {
    const { service, created } = await withYear(current, '2026-12-14');
    await expect(
      service.addHoliday(ctx, termOf(created, 1), {
        date: '2027-01-01',
        name: 'x',
      })
    ).rejects.toThrow(
      new BadRequestException(
        'Cannot add a holiday to a past term. Choose a current or future term.'
      )
    );
    const second = termOf(created, 2);
    await expect(
      service.addHoliday(ctx, second, { date: '2026-12-21', name: 'x' })
    ).rejects.toThrow(
      new BadRequestException(
        'Choose a date inside Second term: 4 Jan 2027 – 26 Mar 2027.'
      )
    );
    await expect(
      service.addHoliday(ctx, second, { date: '2027-01-09', name: 'x' })
    ).rejects.toThrow(
      new BadRequestException(
        '9 Jan 2027 is a weekend. Holidays are school days off.'
      )
    );
    await service.addHoliday(ctx, second, { date: '2027-01-08', name: 'Eid' });
    await expect(
      service.addHoliday(ctx, second, { date: '2027-01-08', name: 'Other' })
    ).rejects.toThrow(
      new ConflictException('8 Jan 2027 is already a holiday: Eid.')
    );
  });

  it('removes a holiday and restores the count', async () => {
    const { service, created } = await withYear();
    const added = await service.addHoliday(ctx, termOf(created, 1), {
      date: '2026-10-01',
      name: 'Independence Day',
    });
    const removed = await service.removeHoliday(ctx, added.holiday.id);
    expect(removed.term.schoolDays).toBe(70);
  });

  it('refuses to remove a holiday once its term has ended', async () => {
    const { service, clock, created } = await withYear();
    const added = await service.addHoliday(ctx, termOf(created, 1), {
      date: '2026-10-01',
      name: 'Independence Day',
    });
    clock.set('2026-12-14');
    await expect(service.removeHoliday(ctx, added.holiday.id)).rejects.toThrow(
      new ConflictException(
        'This term has already ended, so its holidays can’t change.'
      )
    );
  });
});

describe('CalendarService.remove', () => {
  it('refuses a year that has started', async () => {
    const { service, created } = await withYear();
    await expect(service.remove(ctx, created.id)).rejects.toThrow(
      new ConflictException(
        'A school year that has already started cannot be deleted.'
      )
    );
  });

  it('refuses a year holding the current term before it has started', async () => {
    const { service, created, repository } = await withYear(next, '2027-08-01');
    expect(repository.terms[0]?.isCurrent).toBe(true);
    expect(created.deletable.ok).toBe(false);
    await expect(service.remove(ctx, created.id)).rejects.toThrow(
      new ConflictException(
        'The current term is in this school year, so it cannot be deleted.'
      )
    );
  });

  it('maps a database reference to the records message', async () => {
    const { service, repository } = await withYear();
    const later = await service.create(ctx, next);
    repository.referenced = true;
    await expect(service.remove(ctx, later.id)).rejects.toThrow(
      new ConflictException(
        'This school year has students, charges or payments, so it cannot be deleted.'
      )
    );
  });

  it('deletes an empty future year', async () => {
    const { service, repository } = await withYear();
    const later = await service.create(ctx, next);
    await expect(service.remove(ctx, later.id)).resolves.toEqual({
      id: later.id,
    });
    expect(repository.years).toHaveLength(1);
  });
});

describe('CalendarService reads', () => {
  it('answers a null term before any year exists', async () => {
    const { service } = setup();
    await expect(service.current(ctx)).resolves.toEqual({
      term: null,
      schoolYear: null,
      schoolDays: 0,
      schoolDaysSoFar: 0,
    });
  });

  it('counts the school days so far in the current term', async () => {
    const { service } = await withYear();
    const result = await service.current(ctx);
    expect(result.schoolDays).toBe(70);
    expect(result.schoolDaysSoFar).toBe(23);
    expect(result.schoolYear?.name).toBe('2026/2027');
  });

  it('lists days off with a Christmas break that resumes with Second term', async () => {
    const { service } = await withYear();
    const entries = await service.daysOff(ctx, 4);
    expect(entries[0]).toMatchObject({
      kind: 'break',
      name: 'Christmas break',
      resume: '2027-01-04',
    });
  });

  it('answers 404 for a year that is not there', async () => {
    const { service } = setup();
    await expect(service.get(ctx, 'nope')).rejects.toThrow(NotFoundException);
  });
});
