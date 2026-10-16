import {
  compareTerms,
  discountDescription,
  discountLines,
  pendingDiscountReasons,
  percentOf,
  termInRange,
  type DiscountBaseLine,
  type DiscountFacts,
  type TermPosition,
} from './discount-caps';

const first: TermPosition = { sessionStartsOn: '2026-09-01', sequence: 1 };
const second: TermPosition = { sessionStartsOn: '2026-09-01', sequence: 2 };
const third: TermPosition = { sessionStartsOn: '2026-09-01', sequence: 3 };
const nextYear: TermPosition = { sessionStartsOn: '2027-09-01', sequence: 1 };

const fee = (
  feeTypeId: string,
  feeTypeCode: number,
  amountMinor: number
): DiscountBaseLine => ({ feeTypeId, feeTypeCode, amountMinor });

const tuition = (amountMinor: number) => fee('tuition', 4010, amountMinor);
const bus = (amountMinor: number) => fee('bus', 4030, amountMinor);

const discount = (
  id: string,
  over: Partial<DiscountFacts> = {}
): DiscountFacts => ({
  id,
  status: 'approved',
  kind: 'percent',
  value: 5,
  feeTypeId: 'tuition',
  feeTypeName: 'Tuition',
  reason: 'Sibling discount (3 children)',
  approvedAt: '2026-09-01T10:00:00.000Z',
  from: first,
  to: null,
  ...over,
});

describe('compareTerms and termInRange', () => {
  it('orders terms by school year start, then sequence', () => {
    expect(compareTerms(first, second)).toBeLessThan(0);
    expect(compareTerms(third, nextYear)).toBeLessThan(0);
    expect(compareTerms(nextYear, third)).toBeGreaterThan(0);
    expect(compareTerms(second, second)).toBe(0);
  });

  it('includes both ends and is open ended without a last term', () => {
    const range = { from: second, to: third };
    expect(termInRange(first, range)).toBe(false);
    expect(termInRange(second, range)).toBe(true);
    expect(termInRange(third, range)).toBe(true);
    expect(termInRange(nextYear, range)).toBe(false);
    expect(termInRange(nextYear, { from: second, to: null })).toBe(true);
  });
});

describe('percentOf', () => {
  it('rounds half up in minor units', () => {
    expect(percentOf(18_000_000, 5)).toBe(900_000);
    expect(percentOf(10, 5)).toBe(1);
    expect(percentOf(9, 5)).toBe(0);
    expect(percentOf(30, 5)).toBe(2);
    expect(percentOf(333, 50)).toBe(167);
  });
});

describe('discountDescription', () => {
  it('names the fee type in lower case for a percent on a fee type', () => {
    expect(discountDescription(discount('a'))).toBe(
      'Sibling discount (3 children) (5% of tuition)'
    );
  });

  it('says the charge for a whole-charge percent', () => {
    expect(
      discountDescription(
        discount('a', { feeTypeId: null, feeTypeName: null, value: 10 })
      )
    ).toBe('Sibling discount (3 children) (10% of the charge)');
  });

  it('is the bare reason for a fixed amount', () => {
    expect(
      discountDescription(discount('a', { kind: 'fixed', value: 5_000_000 }))
    ).toBe('Sibling discount (3 children)');
  });
});

describe('discountLines', () => {
  it('takes a percent of the fee lines of its fee type only', () => {
    const lines = discountLines(
      [tuition(18_000_000), bus(4_000_000)],
      [discount('a')],
      first
    );
    expect(lines).toEqual([
      {
        studentDiscountId: 'a',
        description: 'Sibling discount (3 children) (5% of tuition)',
        amountMinor: -900_000,
      },
    ]);
  });

  it('takes a whole-charge percent of every fee line', () => {
    const lines = discountLines(
      [tuition(18_000_000), bus(4_000_000)],
      [discount('a', { feeTypeId: null, feeTypeName: null, value: 10 })],
      first
    );
    expect(lines.map((line) => line.amountMinor)).toEqual([-2_200_000]);
  });

  it('sums several lines of one fee type into its base', () => {
    const lines = discountLines(
      [tuition(10_000_000), tuition(8_000_000)],
      [discount('a')],
      first
    );
    expect(lines.map((line) => line.amountMinor)).toEqual([-900_000]);
  });

  it('takes a fixed amount as it is', () => {
    const lines = discountLines(
      [tuition(18_000_000)],
      [discount('a', { kind: 'fixed', value: 5_000_000 })],
      first
    );
    expect(lines.map((line) => line.amountMinor)).toEqual([-5_000_000]);
  });

  it('caps a fixed amount above the fee at the fee', () => {
    const lines = discountLines(
      [tuition(4_500_000)],
      [discount('a', { kind: 'fixed', value: 5_000_000 })],
      first
    );
    expect(lines.map((line) => line.amountMinor)).toEqual([-4_500_000]);
  });

  it('cuts a second discount so two on one fee never exceed it', () => {
    const lines = discountLines(
      [tuition(10_000_000)],
      [
        discount('a', {
          value: 60,
          reason: 'Scholarship',
          approvedAt: '2026-09-01T10:00:00.000Z',
        }),
        discount('b', {
          value: 50,
          reason: 'Staff child',
          approvedAt: '2026-09-02T10:00:00.000Z',
        }),
      ],
      first
    );
    expect(
      lines.map((line) => [line.studentDiscountId, line.amountMinor])
    ).toEqual([
      ['a', -6_000_000],
      ['b', -4_000_000],
    ]);
  });

  it('takes discounts in approval order, not list order', () => {
    const lines = discountLines(
      [tuition(10_000_000)],
      [
        discount('later', {
          value: 50,
          approvedAt: '2026-09-03T00:00:00.000Z',
        }),
        discount('earlier', {
          value: 60,
          approvedAt: '2026-09-01T00:00:00.000Z',
        }),
      ],
      first
    );
    expect(
      lines.map((line) => [line.studentDiscountId, line.amountMinor])
    ).toEqual([
      ['earlier', -6_000_000],
      ['later', -4_000_000],
    ]);
  });

  it('adds no line for a discount that takes nothing', () => {
    const lines = discountLines(
      [tuition(10_000_000)],
      [
        discount('all', { value: 100, approvedAt: '2026-09-01T00:00:00.000Z' }),
        discount('none', { value: 5, approvedAt: '2026-09-02T00:00:00.000Z' }),
        discount('wrong-type', { feeTypeId: 'bus', feeTypeName: 'School bus' }),
        discount('tiny', {
          kind: 'percent',
          value: 1,
          feeTypeId: 'bus',
          feeTypeName: 'School bus',
        }),
      ],
      first
    );
    expect(lines.map((line) => line.studentDiscountId)).toEqual(['all']);
  });

  it('draws a whole-charge discount down the fee types in code order', () => {
    const fees = [bus(1_000_000), tuition(3_000_000)];
    const lines = discountLines(
      fees,
      [
        discount('tuition-first', {
          value: 100,
          approvedAt: '2026-09-01T00:00:00.000Z',
        }),
        discount('whole', {
          feeTypeId: null,
          feeTypeName: null,
          kind: 'fixed',
          value: 2_000_000,
          approvedAt: '2026-09-02T00:00:00.000Z',
        }),
      ],
      first
    );
    expect(lines.map((line) => line.amountMinor)).toEqual([
      -3_000_000, -1_000_000,
    ]);
  });

  it('never lets whole-charge discounts take more than the fee lines', () => {
    const lines = discountLines(
      [tuition(1_000_000), bus(1_000_000)],
      [
        discount('a', {
          feeTypeId: null,
          feeTypeName: null,
          value: 80,
          approvedAt: '2026-09-01T00:00:00.000Z',
        }),
        discount('b', {
          feeTypeId: null,
          feeTypeName: null,
          value: 80,
          approvedAt: '2026-09-02T00:00:00.000Z',
        }),
      ],
      first
    );
    const taken = lines.reduce((sum, line) => sum + line.amountMinor, 0);
    expect(taken).toBe(-2_000_000);
    expect(lines.map((line) => line.amountMinor)).toEqual([
      -1_600_000, -400_000,
    ]);
  });

  it('ignores a discount that is waiting, rejected or out of range', () => {
    const lines = discountLines(
      [tuition(10_000_000)],
      [
        discount('waiting', { status: 'submitted' }),
        discount('rejected', { status: 'rejected' }),
        discount('later', { from: third }),
        discount('ended', { from: first, to: first }),
      ],
      second
    );
    expect(lines).toEqual([]);
  });

  it('applies an open-ended discount in a later school year', () => {
    const lines = discountLines(
      [tuition(10_000_000)],
      [discount('a')],
      nextYear
    );
    expect(lines).toHaveLength(1);
  });

  it('gives nothing when the charge has no fee lines', () => {
    expect(discountLines([], [discount('a')], first)).toEqual([]);
  });
});

describe('pendingDiscountReasons', () => {
  it('lists the reasons of waiting discounts that cover the term', () => {
    expect(
      pendingDiscountReasons(
        [
          discount('a', {
            status: 'submitted',
            reason: 'Academic scholarship',
          }),
          discount('b', { status: 'approved', reason: 'Sibling' }),
          discount('c', { status: 'submitted', reason: 'Later', from: third }),
          discount('d', { status: 'rejected', reason: 'Declined' }),
        ],
        second
      )
    ).toEqual(['Academic scholarship']);
  });
});
