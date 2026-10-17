import {
  activityQuerySchema,
  dashboardFinanceSchema,
  dashboardRollSchema,
  dashboardStoreSchema,
  dashboardTaskSchema,
  myClassSchema,
} from './dashboard';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const person = (n: number) => ({ id: id(n), name: `Student ${n}` });

describe('dashboardTaskSchema', () => {
  it.each([
    { kind: 'dueLeft', count: 1, students: [person(1)] },
    {
      kind: 'notSeen',
      count: 1,
      students: [{ ...person(1), notSeenSince: '2026-09-01' }],
    },
    {
      kind: 'notInClass',
      count: 1,
      students: [person(1)],
      startYear: { name: '2027/2028' },
    },
    { kind: 'notInClass', count: 1, students: [], startYear: null },
    { kind: 'noClassTeacher', count: 1, classes: [person(1)] },
    { kind: 'announcementDrafts', count: 2, titles: ['PTA', 'Sports day'] },
    { kind: 'lowStock', count: 4, names: ['Tie', 'School shirt, Size 12'] },
    { kind: 'noRole', memberId: id(1), name: 'Ada Obi' },
    {
      kind: 'approvalsWaiting',
      count: 2,
      items: [
        {
          label: 'Cancel a payment',
          details: 'RCT-2026-00098 from Mrs Danjuma',
        },
        { label: 'Cancel a balance', details: 'Bola: Left the school' },
      ],
    },
  ])('parses a $kind task', (task) => {
    expect(dashboardTaskSchema.parse(task)).toEqual(task);
  });

  it('rejects an unknown kind', () => {
    expect(
      dashboardTaskSchema.safeParse({ kind: 'owed', count: 1 }).success
    ).toBe(false);
  });

  it('rejects more than two approval items in the task', () => {
    const item = { label: 'Refund', details: 'Ada: Overpaid' };
    expect(
      dashboardTaskSchema.safeParse({
        kind: 'approvalsWaiting',
        count: 3,
        items: [item, item, item],
      }).success
    ).toBe(false);
  });

  it('rejects a sample list over five', () => {
    const students = [1, 2, 3, 4, 5, 6].map((n) => person(n));
    expect(
      dashboardTaskSchema.safeParse({ kind: 'dueLeft', count: 6, students })
        .success
    ).toBe(false);
    expect(
      myClassSchema.safeParse({
        armId: id(9),
        name: 'JSS 1A',
        campusName: 'Lekki',
        studentCount: 6,
        isClassTeacher: true,
        subjects: [],
        sampleStudents: students,
      }).success
    ).toBe(false);
  });
});

describe('myClassSchema', () => {
  it('takes a subject-teacher row that is not a class teacher, with its subjects', () => {
    const parsed = myClassSchema.safeParse({
      armId: id(9),
      name: 'JSS 2 Gold',
      campusName: 'Lekki',
      studentCount: 0,
      isClassTeacher: false,
      subjects: ['Mathematics', 'English Language'],
      sampleStudents: [],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.subjects).toEqual(['Mathematics', 'English Language']);
  });
});

describe('activityQuerySchema', () => {
  it('defaults to page 1, coerces the string and refuses page 0', () => {
    expect(activityQuerySchema.parse({})).toEqual({ page: 1 });
    expect(activityQuerySchema.parse({ page: '2' })).toEqual({ page: 2 });
    expect(activityQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });
});

describe('dashboardFinanceSchema', () => {
  it('parses an owed-only payload with the received fields omitted', () => {
    const finance = { currency: 'NGN', owedMinor: 250_000, owingStudents: 3 };
    expect(dashboardFinanceSchema.parse(finance)).toEqual(finance);
  });

  it('parses the received fields when present', () => {
    const finance = {
      currency: 'NGN',
      receivedMinor: 90_000,
      paymentCount: 2,
      owedMinor: 0,
      owingStudents: 0,
    };
    expect(dashboardFinanceSchema.parse(finance)).toEqual(finance);
  });

  it('refuses a negative owed total', () => {
    expect(
      dashboardFinanceSchema.safeParse({
        currency: 'NGN',
        owedMinor: -1,
        owingStudents: 0,
      }).success
    ).toBe(false);
  });

  it('refuses a negative received total', () => {
    expect(
      dashboardFinanceSchema.safeParse({
        currency: 'NGN',
        receivedMinor: -1,
        paymentCount: 0,
        owedMinor: 0,
        owingStudents: 0,
      }).success
    ).toBe(false);
  });
});

describe('dashboardRollSchema', () => {
  const counts = {
    active: 10,
    newIntakes: 2,
    inactive: 1,
    dueLeft: 0,
    left: 3,
    leftThisTerm: 1,
    graduated: 4,
    campusNames: null,
  };

  it('parses the roll without the owed fields', () => {
    expect(dashboardRollSchema.parse(counts)).toEqual(counts);
  });

  it('parses the roll with the owed fields', () => {
    const roll = {
      ...counts,
      currency: 'NGN',
      owedMinor: {
        active: 500_000,
        newIntakes: 100_000,
        inactive: 0,
        left: 40_000,
        graduated: 0,
      },
      formerOwedMinor: 40_000,
    };
    expect(dashboardRollSchema.parse(roll)).toEqual(roll);
  });
});

describe('dashboardStoreSchema', () => {
  const store = {
    stockValueMinor: 1_200_000,
    termSalesMinor: 650_000,
    termCostMinor: 500_000,
    termSalesCount: 2,
    termItemsSold: 4,
    termStudentsServed: 2,
  };

  it('carries the stock value and this term’s sales figures', () => {
    expect(dashboardStoreSchema.parse(store)).toEqual(store);
  });

  it('refuses a payload without the term figures', () => {
    expect(dashboardStoreSchema.safeParse({ stockValueMinor: 1 }).success).toBe(
      false
    );
  });

  it('refuses a negative count', () => {
    expect(
      dashboardStoreSchema.safeParse({ ...store, termStudentsServed: -1 })
        .success
    ).toBe(false);
  });
});
