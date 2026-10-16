import type { FeeLine } from '@eduvault/api-contract';
import { chargeLines, chargeTotal } from './charge-lines';
import type { DiscountFacts } from './discount-caps';

const TERM = { sessionStartsOn: '2026-09-01', sequence: 2 };

const feeLine = (id: string, over: Partial<FeeLine> = {}): FeeLine => ({
  id,
  termId: 'term-2',
  classLevelId: 'jss2',
  levelName: 'JSS 2',
  levelSequence: 2,
  feeTypeId: 'tuition',
  feeTypeCode: 4010,
  feeTypeName: 'Tuition',
  campusId: null,
  campusName: null,
  name: 'JSS 2 Tuition',
  amountMinor: 18_000_000,
  appliesTo: 'all',
  isOptional: false,
  retiredAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

const student = {
  termId: 'term-2',
  classLevelId: 'jss2',
  campusId: 'lekki',
  isNew: false,
  optedInFeeTypeIds: new Set<string>(),
};

const sibling: DiscountFacts = {
  id: 'sibling',
  status: 'approved',
  kind: 'percent',
  value: 5,
  feeTypeId: 'tuition',
  feeTypeName: 'Tuition',
  reason: 'Sibling discount (3 children)',
  approvedAt: '2026-09-01T00:00:00.000Z',
  from: { sessionStartsOn: '2026-09-01', sequence: 1 },
  to: null,
};

describe('chargeLines', () => {
  it('copies the fee lines that apply, in fee type order, then the discounts', () => {
    const lines = chargeLines({
      feeLines: [
        feeLine('bus', {
          feeTypeId: 'bus',
          feeTypeCode: 4030,
          name: 'School bus',
          amountMinor: 4_000_000,
        }),
        feeLine('tuition'),
        feeLine('other-level', { classLevelId: 'jss1' }),
      ],
      student,
      discounts: [sibling],
      term: TERM,
      discountsAccountId: 'discounts-given',
    });
    expect(lines).toEqual([
      {
        feeLineId: 'tuition',
        studentDiscountId: null,
        ledgerAccountId: 'tuition',
        description: 'JSS 2 Tuition',
        amountMinor: 18_000_000,
      },
      {
        feeLineId: 'bus',
        studentDiscountId: null,
        ledgerAccountId: 'bus',
        description: 'School bus',
        amountMinor: 4_000_000,
      },
      {
        feeLineId: null,
        studentDiscountId: 'sibling',
        ledgerAccountId: 'discounts-given',
        description: 'Sibling discount (3 children) (5% of tuition)',
        amountMinor: -900_000,
      },
    ]);
    expect(chargeTotal(lines)).toBe(21_100_000);
  });

  it('is empty when no fee line applies', () => {
    expect(
      chargeLines({
        feeLines: [feeLine('other-level', { classLevelId: 'jss1' })],
        student,
        discounts: [sibling],
        term: TERM,
        discountsAccountId: 'discounts-given',
      })
    ).toEqual([]);
  });

  it('leaves an optional fee out until the student opts in', () => {
    const optional = feeLine('trip', {
      feeTypeId: 'trip',
      feeTypeCode: 4070,
      isOptional: true,
      amountMinor: 1_500_000,
    });
    const input = {
      feeLines: [optional],
      discounts: [],
      term: TERM,
      discountsAccountId: 'discounts-given',
    };
    expect(chargeLines({ ...input, student })).toEqual([]);
    expect(
      chargeLines({
        ...input,
        student: { ...student, optedInFeeTypeIds: new Set(['trip']) },
      })
    ).toHaveLength(1);
  });
});
