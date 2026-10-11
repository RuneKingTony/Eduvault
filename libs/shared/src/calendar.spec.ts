import {
  addDays,
  canMakeCurrent,
  type CalendarTerm,
  daysBetween,
  daysUntilLabel,
  daysOff,
  firstMondayOnOrAfter,
  isWeekend,
  lastFridayOnOrBefore,
  newYearDefaults,
  relativeDays,
  schoolDays,
  schoolDaysSoFar,
  splitTerms,
  termPercentDone,
  termWeek,
  termWeeks,
  YEAR_NAME_ERROR,
  yearNameError,
} from './calendar';

const dates = (terms: ReturnType<typeof splitTerms>) =>
  terms.map((term) => [term.startsOn, term.endsOn]);

describe('date helpers', () => {
  it('adds and counts days across a leap day', () => {
    expect(addDays('2028-02-28', 2)).toBe('2028-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2027-09-06', '2028-07-28')).toBe(326);
  });

  it('finds weekends, the next Monday and the previous Friday', () => {
    expect(isWeekend('2026-10-03')).toBe(true);
    expect(isWeekend('2026-10-05')).toBe(false);
    expect(firstMondayOnOrAfter('2027-09-06')).toBe('2027-09-06');
    expect(firstMondayOnOrAfter('2026-09-06')).toBe('2026-09-07');
    expect(lastFridayOnOrBefore('2028-07-28')).toBe('2028-07-28');
    expect(lastFridayOnOrBefore('2027-12-14')).toBe('2027-12-10');
  });

  it('refuses a malformed date', () => {
    expect(() => addDays('nope', 1)).toThrow(RangeError);
  });
});

describe('splitTerms', () => {
  it('splits 2027/2028 by the PRD rule', () => {
    const terms = splitTerms('2027-09-06', '2028-07-28');
    expect(terms.map((term) => term.name)).toEqual([
      'First term',
      'Second term',
      'Third term',
    ]);
    expect(dates(terms)).toEqual([
      ['2027-09-06', '2027-12-10'],
      ['2028-01-03', '2028-03-31'],
      ['2028-04-24', '2028-07-28'],
    ]);
  });

  it('splits 2026/2027', () => {
    expect(dates(splitTerms('2026-09-07', '2027-07-23'))).toEqual([
      ['2026-09-07', '2026-12-11'],
      ['2027-01-04', '2027-03-26'],
      ['2027-04-19', '2027-07-23'],
    ]);
  });

  it.each([84, 400])(
    'keeps three ordered terms inside a %i-day year',
    (length) => {
      for (let offset = 0; offset < 7; offset += 1) {
        const startsOn = addDays('2026-09-07', offset);
        const endsOn = addDays(startsOn, length);
        const terms = splitTerms(startsOn, endsOn);
        expect(terms).toHaveLength(3);
        let previousEnd = addDays(startsOn, -1);
        for (const term of terms) {
          expect(term.startsOn <= term.endsOn).toBe(true);
          expect(term.startsOn > previousEnd).toBe(true);
          previousEnd = term.endsOn;
        }
        expect((terms[0]?.startsOn ?? '') >= startsOn).toBe(true);
        expect(previousEnd <= endsOn).toBe(true);
      }
    }
  );
});

describe('school days', () => {
  const holidays = ['2026-10-01', '2026-10-29', '2026-10-30'];

  it('counts weekdays minus holidays', () => {
    expect(schoolDays('2026-09-07', '2026-12-11', [])).toBe(70);
    expect(schoolDays('2026-09-07', '2026-12-11', holidays)).toBe(67);
  });

  it('ignores a holiday outside the range', () => {
    expect(schoolDays('2026-09-07', '2026-09-11', ['2026-10-01'])).toBe(5);
  });

  it('counts up to today and clamps to zero and the total', () => {
    const term = { startsOn: '2026-09-07', endsOn: '2026-12-11' };
    expect(schoolDaysSoFar(term, holidays, '2026-09-06')).toBe(0);
    expect(schoolDaysSoFar(term, holidays, '2026-09-07')).toBe(1);
    expect(schoolDaysSoFar(term, holidays, '2026-10-07')).toBe(22);
    expect(schoolDaysSoFar(term, holidays, '2027-01-01')).toBe(67);
  });
});

describe('newYearDefaults', () => {
  it('follows the latest year', () => {
    expect(newYearDefaults({ endsOn: '2027-07-23' }, '2026-10-07')).toEqual({
      name: '2027/2028',
      startsOn: '2027-09-06',
      endsOn: '2028-07-28',
    });
  });

  it('starts from the current year when there is none', () => {
    expect(newYearDefaults(null, '2026-10-07')).toEqual({
      name: '2026/2027',
      startsOn: '2026-09-07',
      endsOn: '2027-07-23',
    });
  });
});

describe('yearNameError', () => {
  it('accepts two years in a row', () => {
    expect(yearNameError('2027/2028')).toBeNull();
  });

  it.each(['2027/2029', '27/28', '2027-2028', '2028/2027', ''])(
    'refuses %j',
    (name) => {
      expect(yearNameError(name)).toBe(YEAR_NAME_ERROR);
    }
  );
});

const term = (
  sequence: number,
  span: { startsOn: string; endsOn: string },
  sessionId = 'y1'
): CalendarTerm => ({
  id: `${sessionId}-${sequence}`,
  sessionId,
  sequence,
  ...span,
});

describe('daysOff', () => {
  const terms = [
    term(1, { startsOn: '2026-09-07', endsOn: '2026-12-11' }),
    term(2, { startsOn: '2027-01-11', endsOn: '2027-04-02' }),
    term(3, { startsOn: '2027-04-19', endsOn: '2027-07-23' }),
    term(1, { startsOn: '2027-09-06', endsOn: '2027-12-10' }, 'y2'),
  ];

  it('merges a Thursday and Friday into one two-day entry', () => {
    const entries = daysOff({
      terms: [],
      holidays: [
        { date: '2026-10-29', name: 'Mid-term break' },
        { date: '2026-10-30', name: 'Mid-term break' },
      ],
      today: '2026-10-07',
      limit: 10,
    });
    expect(entries).toEqual([
      {
        kind: 'holiday',
        name: 'Mid-term break',
        start: '2026-10-29',
        end: '2026-10-30',
        days: 2,
      },
    ]);
  });

  it('merges a Friday with the next Monday and keeps other names apart', () => {
    const entries = daysOff({
      terms: [],
      holidays: [
        { date: '2027-03-26', name: 'Easter' },
        { date: '2027-03-29', name: 'Easter' },
        { date: '2027-03-30', name: 'Other' },
      ],
      today: '2027-03-01',
      limit: 10,
    });
    expect(entries.map((entry) => [entry.name, entry.days])).toEqual([
      ['Easter', 2],
      ['Other', 1],
    ]);
  });

  it('names breaks by sequence and resumes at the next term', () => {
    const entries = daysOff({
      terms,
      holidays: [],
      today: '2026-12-12',
      limit: 10,
    });
    expect(entries.map((entry) => [entry.name, entry.resume])).toEqual([
      ['Christmas break', '2027-01-11'],
      ['Easter break', '2027-04-19'],
      ['End-of-term break', '2027-09-06'],
    ]);
    expect(entries[0]?.start).toBe('2026-12-12');
    expect(entries[0]?.end).toBe('2027-01-10');
    expect(entries[0]?.days).toBe(20);
  });

  it('drops entries in the past and honours the limit', () => {
    const entries = daysOff({
      terms,
      holidays: [{ date: '2026-10-01', name: 'Independence Day' }],
      today: '2027-04-10',
      limit: 1,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.name).toBe('Easter break');
  });
});

describe('canMakeCurrent', () => {
  const years = [
    { id: 'y1', startsOn: '2026-09-07', endsOn: '2027-07-23' },
    { id: 'y2', startsOn: '2027-09-06', endsOn: '2028-07-28' },
    { id: 'y3', startsOn: '2028-09-04', endsOn: '2029-07-27' },
  ];
  const currentTerm = { id: 't1-3', sessionId: 'y1' };
  const offer = (id: string, sessionId: string, sequence: number) =>
    canMakeCurrent({ id, sessionId, sequence }, { currentTerm, years });

  it('offers the other terms of the current year', () => {
    expect(offer('t1-1', 'y1', 1)).toBe(true);
    expect(offer('t1-2', 'y1', 2)).toBe(true);
    expect(offer('t1-3', 'y1', 3)).toBe(false);
  });

  it('offers only the first term of the year that starts next', () => {
    expect(offer('t2-1', 'y2', 1)).toBe(true);
    expect(offer('t2-2', 'y2', 2)).toBe(false);
    expect(offer('t3-1', 'y3', 1)).toBe(false);
  });

  it('never goes back to an earlier year', () => {
    const later = { id: 't2-1', sessionId: 'y2' };
    expect(
      canMakeCurrent(
        { id: 't1-1', sessionId: 'y1', sequence: 1 },
        { currentTerm: later, years }
      )
    ).toBe(false);
  });

  it('offers nothing without a current term', () => {
    expect(
      canMakeCurrent(
        { id: 't1-1', sessionId: 'y1', sequence: 1 },
        { currentTerm: null, years }
      )
    ).toBe(false);
  });
});

describe('termWeek', () => {
  it('is Week 1 on day 0 and day 1', () => {
    expect(termWeek(0)).toBe(1);
    expect(termWeek(1)).toBe(1);
  });

  it('stays in week 1 on day 5 and moves to week 2 on day 6', () => {
    expect(termWeek(5)).toBe(1);
    expect(termWeek(6)).toBe(2);
  });

  it('counts a holiday-shortened term by school days', () => {
    expect(termWeeks(47)).toBe(10);
    expect(termWeek(47)).toBe(10);
    expect(termWeeks(50)).toBe(10);
  });
});

describe('termPercentDone', () => {
  it('is 0 for a term with no school days', () => {
    expect(termPercentDone(0, 0)).toBe(0);
  });

  it('is the share of school days done', () => {
    expect(termPercentDone(22, 88)).toBe(25);
    expect(termPercentDone(88, 88)).toBe(100);
  });
});

describe('relativeDays', () => {
  const from = '2026-10-01';
  const after = (days: number) => relativeDays(from, addDays(from, days));

  it('says Today and Tomorrow', () => {
    expect(after(0)).toBe('Today');
    expect(after(1)).toBe('Tomorrow');
  });

  it('counts days under two weeks', () => {
    expect(after(2)).toBe('in 2 days');
    expect(after(13)).toBe('in 13 days');
  });

  it('rounds weeks from 14 days to under 70', () => {
    expect(after(14)).toBe('in 2 weeks');
    expect(after(69)).toBe('in 10 weeks');
  });

  it('rounds months from 70 days', () => {
    expect(after(70)).toBe('in 2 months');
    expect(after(200)).toBe('in 7 months');
  });
});

describe('daysUntilLabel', () => {
  const from = '2026-10-01';

  it('says Today, Tomorrow and a day count', () => {
    expect(daysUntilLabel(from, from)).toBe('Today');
    expect(daysUntilLabel(from, '2026-10-02')).toBe('Tomorrow');
    expect(daysUntilLabel(from, '2026-10-14')).toBe('13 days');
    expect(daysUntilLabel(from, '2026-12-09')).toBe('69 days');
  });
});
