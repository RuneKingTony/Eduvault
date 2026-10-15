import type { SchoolYear, Term } from '@eduvault/api-contract';
import { chosenTerm, feeTermOptions } from './fee-terms';

const term = (id: string, sequence: number, isCurrent = false): Term => ({
  id,
  schoolYearId: 'y',
  sequence,
  name: ['First term', 'Second term', 'Third term'][sequence - 1] ?? '',
  startsOn: '2026-09-07',
  endsOn: '2026-12-18',
  isCurrent,
  ended: false,
  schoolDays: 60,
  holidayCount: 0,
  holidays: [],
  canMakeCurrent: false,
});

const year = (name: string, startsOn: string, terms: Term[]): SchoolYear => ({
  id: name,
  name,
  startsOn,
  endsOn: '2027-07-23',
  terms,
  deletable: { ok: false, reason: null },
  studentsWaiting: null,
});

const y2627 = (current: 1 | 2 | 3) =>
  year(
    '2026/2027',
    '2026-09-07',
    [1, 2, 3].map((n) => term(`t${n}`, n, n === current))
  );

describe('feeTermOptions', () => {
  it('offers the current term and the next term of the same year', () => {
    expect(feeTermOptions([y2627(1)])).toEqual([
      { id: 't1', label: 'First term, 2026/2027', isCurrent: true },
      { id: 't2', label: 'Second term, 2026/2027', isCurrent: false },
    ]);
  });

  it('offers the first term of the next year from the third term once it exists', () => {
    const next = year('2027/2028', '2027-09-06', [term('n1', 1)]);
    expect(feeTermOptions([next, y2627(3)]).map((option) => option.id)).toEqual(
      ['t3', 'n1']
    );
  });

  it('offers only the third term while the next year does not exist', () => {
    expect(feeTermOptions([y2627(3)]).map((option) => option.id)).toEqual([
      't3',
    ]);
  });

  it('offers nothing with no current term', () => {
    expect(
      feeTermOptions([y2627(1)].map((y) => ({ ...y, terms: [] })))
    ).toEqual([]);
  });
});

describe('chosenTerm', () => {
  const options = feeTermOptions([y2627(1)]);

  it('keeps a wanted term that is offered and falls back to the current term', () => {
    expect(chosenTerm(options, 't2')?.id).toBe('t2');
    expect(chosenTerm(options, 'gone')?.id).toBe('t1');
    expect(chosenTerm(options, undefined)?.id).toBe('t1');
    expect(chosenTerm([], 't1')).toBeUndefined();
  });
});
