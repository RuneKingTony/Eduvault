import type { FeeLine } from '@eduvault/api-contract';
import {
  planRound,
  type RoundCandidate,
  type RoundPlanInput,
} from './round-plan';

const candidate = (
  studentId: string,
  over: Partial<RoundCandidate> = {}
): RoundCandidate => ({
  studentId,
  enrollmentId: `enrollment-${studentId}`,
  firstName: studentId,
  lastName: 'Obi',
  admissionNumber: `GF/${studentId}`,
  isNew: false,
  termPlacementCampusId: 'lekki',
  latestPlacementCampusId: 'lekki',
  homeCampusId: 'lekki',
  classLevelId: 'jss2',
  ...over,
});

const tuition: FeeLine = {
  id: 'tuition-line',
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
};

const input = (over: Partial<RoundPlanInput> = {}): RoundPlanInput => ({
  termId: 'term-2',
  term: { sessionStartsOn: '2026-09-01', sequence: 2 },
  feeLines: [tuition],
  optedIn: new Map(),
  discounts: new Map(),
  discountsAccountId: 'discounts-5000',
  ...over,
});

describe('planRound', () => {
  it('plans a charge for each student with fee lines and counts the rest as none', () => {
    const plan = planRound(
      [candidate('ada'), candidate('level-one', { classLevelId: 'jss1' })],
      input()
    );
    expect(plan.none).toBe(1);
    expect(plan.charges).toEqual([
      {
        studentId: 'ada',
        name: 'ada Obi',
        campusId: 'lekki',
        lines: [
          {
            feeLineId: 'tuition-line',
            studentDiscountId: null,
            ledgerAccountId: 'tuition',
            description: 'JSS 2 Tuition',
            amountMinor: 18_000_000,
          },
        ],
      },
    ]);
  });

  it('freezes the campus for the term on the charge', () => {
    const plan = planRound(
      [candidate('ada', { termPlacementCampusId: 'ikeja' })],
      input()
    );
    expect(plan.charges[0]?.campusId).toBe('ikeja');
  });

  it('gives a new student the new-only fees and an opted-in student the optional ones', () => {
    const newOnly: FeeLine = {
      ...tuition,
      id: 'form',
      feeTypeId: 'form',
      feeTypeCode: 4090,
      name: 'Admission form',
      amountMinor: 500_000,
      appliesTo: 'new',
    };
    const trip: FeeLine = {
      ...tuition,
      id: 'trip',
      feeTypeId: 'trip',
      feeTypeCode: 4070,
      name: 'Excursion',
      amountMinor: 1_000_000,
      isOptional: true,
    };
    const plan = planRound(
      [candidate('new-kid', { isNew: true }), candidate('trip-kid')],
      input({
        feeLines: [tuition, newOnly, trip],
        optedIn: new Map([['enrollment-trip-kid', new Set(['trip'])]]),
      })
    );
    const names = (id: string) =>
      plan.charges
        .find((charge) => charge.studentId === id)
        ?.lines.map((line) => line.description);
    expect(names('new-kid')).toEqual(['JSS 2 Tuition', 'Admission form']);
    expect(names('trip-kid')).toEqual(['JSS 2 Tuition', 'Excursion']);
  });

  it('adds the approved discount line a student holds', () => {
    const plan = planRound(
      [candidate('ada')],
      input({
        discounts: new Map([
          [
            'ada',
            [
              {
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
              },
            ],
          ],
        ]),
      })
    );
    expect(plan.charges[0]?.lines.map((line) => line.amountMinor)).toEqual([
      18_000_000, -900_000,
    ]);
  });

  it('counts a student as none when no fee line applies and create otherwise', () => {
    const none = planRound([candidate('ada')], input({ feeLines: [] }));
    expect(none.charges).toEqual([]);
    expect(none.none).toBe(1);

    const create = planRound([candidate('ada')], input());
    expect(create.charges.map((charge) => charge.studentId)).toEqual(['ada']);
    expect(create.none).toBe(0);
  });

  it('plans nothing for an empty list', () => {
    expect(planRound([], input())).toEqual({
      charges: [],
      none: 0,
    });
  });
});
