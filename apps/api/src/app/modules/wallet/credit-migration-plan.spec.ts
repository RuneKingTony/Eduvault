import {
  matchesReviewed,
  planCreditMigration,
  reportOf,
  type CreditStudent,
  type PayerLink,
  type PlanFacts,
  type WalletOwner,
} from './credit-migration-plan';

const student = (over: Partial<CreditStudent> = {}): CreditStudent => ({
  studentId: 'st-ada',
  name: 'Ada Okeke',
  admissionNumber: 'ADM-001',
  creditMinor: 500_000,
  status: 'active',
  campusId: 'campus-lekki',
  campusName: 'Lekki',
  ...over,
});

const owner = (over: Partial<WalletOwner> = {}): WalletOwner => ({
  guardianId: 'g-ngozi',
  walletId: 'w-ngozi',
  guardianName: 'Ngozi Okeke',
  phone: '08011112222',
  ...over,
});

const link = (over: Partial<PayerLink> = {}): PayerLink => ({
  studentId: 'st-ada',
  guardianId: 'g-ngozi',
  linkedAt: '2026-01-05T09:00:00.000000',
  ...over,
});

const facts = (over: Partial<PlanFacts> = {}): PlanFacts => ({
  students: [student()],
  payers: [link()],
  owners: [owner()],
  migratedGuardianIds: new Set(),
  ...over,
});

describe('planCreditMigration', () => {
  it('moves a student’s credit to the guardian who pays for them', () => {
    const plan = planCreditMigration(facts());

    expect(plan.notMoved).toEqual([]);
    expect(plan.families).toEqual([
      {
        guardianId: 'g-ngozi',
        walletId: 'w-ngozi',
        guardianName: 'Ngozi Okeke',
        phone: '08011112222',
        totalMinor: 500_000,
        children: [
          {
            studentId: 'st-ada',
            name: 'Ada Okeke',
            admissionNumber: 'ADM-001',
            amountMinor: 500_000,
            status: 'active',
            campusName: 'Lekki',
            campusId: 'campus-lekki',
          },
        ],
      },
    ]);
  });

  it('adds siblings’ credit into one family total, children in name order', () => {
    const plan = planCreditMigration(
      facts({
        students: [
          student({
            studentId: 'st-uche',
            name: 'Uche Okeke',
            creditMinor: 300_000,
          }),
          student(),
        ],
        payers: [link({ studentId: 'st-uche' }), link()],
      })
    );

    expect(plan.families).toHaveLength(1);
    expect(plan.families[0]?.totalMinor).toBe(800_000);
    expect(plan.families[0]?.children.map((child) => child.name)).toEqual([
      'Ada Okeke',
      'Uche Okeke',
    ]);
  });

  it('picks the guardian whose link is oldest when two pay', () => {
    const plan = planCreditMigration(
      facts({
        owners: [
          owner(),
          owner({
            guardianId: 'g-emeka',
            walletId: 'w-emeka',
            guardianName: 'Emeka Okeke',
          }),
        ],
        payers: [
          link({
            guardianId: 'g-ngozi',
            linkedAt: '2026-03-01T09:00:00.000000',
          }),
          link({
            guardianId: 'g-emeka',
            linkedAt: '2026-01-01T09:00:00.000000',
          }),
        ],
      })
    );

    expect(plan.families.map((family) => family.guardianId)).toEqual([
      'g-emeka',
    ]);
  });

  it('breaks a tie on the link time by the smaller guardian id', () => {
    const sameMoment = '2026-01-01T09:00:00.000000';
    const plan = planCreditMigration(
      facts({
        owners: [
          owner({ guardianId: 'g-b', walletId: 'w-b' }),
          owner({ guardianId: 'g-a', walletId: 'w-a' }),
        ],
        payers: [
          link({ guardianId: 'g-b', linkedAt: sameMoment }),
          link({ guardianId: 'g-a', linkedAt: sameMoment }),
        ],
      })
    );

    expect(plan.families.map((family) => family.guardianId)).toEqual(['g-a']);
  });

  it('lists a student nobody pays for and leaves their credit where it is', () => {
    const plan = planCreditMigration(facts({ payers: [] }));

    expect(plan.families).toEqual([]);
    expect(plan.notMoved).toEqual([
      {
        studentId: 'st-ada',
        name: 'Ada Okeke',
        admissionNumber: 'ADM-001',
        amountMinor: 500_000,
        reason: 'no_paying_guardian',
      },
    ]);
  });

  it('treats a payer with no wallet as no payer, and falls back to the next one', () => {
    const lone = planCreditMigration(facts({ owners: [] }));
    expect(lone.notMoved.map((row) => row.reason)).toEqual([
      'no_paying_guardian',
    ]);

    const next = planCreditMigration(
      facts({
        payers: [
          link({
            guardianId: 'g-nowallet',
            linkedAt: '2026-01-01T00:00:00.000000',
          }),
          link(),
        ],
      })
    );
    expect(next.families.map((family) => family.guardianId)).toEqual([
      'g-ngozi',
    ]);
  });

  it('never moves a debt or a settled account', () => {
    const plan = planCreditMigration(
      facts({
        students: [
          student({ creditMinor: 0 }),
          student({ studentId: 'st-debt', creditMinor: -250_000 }),
        ],
      })
    );

    expect(plan).toEqual({ families: [], notMoved: [] });
  });

  it('includes students who have left or graduated and keeps their status', () => {
    const plan = planCreditMigration(
      facts({
        students: [
          student({ status: 'left' }),
          student({
            studentId: 'st-bola',
            name: 'Bola Okeke',
            status: 'graduated',
          }),
        ],
        payers: [link(), link({ studentId: 'st-bola' })],
      })
    );

    expect(plan.families[0]?.children.map((child) => child.status)).toEqual([
      'left',
      'graduated',
    ]);
  });

  it('lists credit of a family that was already moved, and moves the others', () => {
    const plan = planCreditMigration(
      facts({
        students: [
          student(),
          student({
            studentId: 'st-chi',
            name: 'Chi Eze',
            creditMinor: 90_000,
          }),
        ],
        owners: [
          owner(),
          owner({
            guardianId: 'g-eze',
            walletId: 'w-eze',
            guardianName: 'Mrs Eze',
          }),
        ],
        payers: [link(), link({ studentId: 'st-chi', guardianId: 'g-eze' })],
        migratedGuardianIds: new Set(['g-ngozi']),
      })
    );

    expect(plan.families.map((family) => family.guardianId)).toEqual(['g-eze']);
    expect(plan.notMoved).toEqual([
      expect.objectContaining({
        studentId: 'st-ada',
        amountMinor: 500_000,
        reason: 'family_already_migrated',
      }),
    ]);
  });

  it('orders families by guardian name', () => {
    const plan = planCreditMigration(
      facts({
        students: [
          student(),
          student({
            studentId: 'st-chi',
            name: 'Chi Eze',
            creditMinor: 90_000,
          }),
        ],
        owners: [
          owner(),
          owner({
            guardianId: 'g-adeyemi',
            walletId: 'w-adeyemi',
            guardianName: 'Mr Adeyemi',
          }),
        ],
        payers: [
          link(),
          link({ studentId: 'st-chi', guardianId: 'g-adeyemi' }),
        ],
      })
    );

    expect(plan.families.map((family) => family.guardianName)).toEqual([
      'Mr Adeyemi',
      'Ngozi Okeke',
    ]);
  });
});

describe('reportOf', () => {
  it('totals what moves and what stays, and drops the internal ids', () => {
    const plan = planCreditMigration(
      facts({
        students: [
          student(),
          student({
            studentId: 'st-uche',
            name: 'Uche Okeke',
            creditMinor: 300_000,
          }),
          student({
            studentId: 'st-lone',
            name: 'Lone Child',
            creditMinor: 40_000,
          }),
        ],
        payers: [link(), link({ studentId: 'st-uche' })],
      })
    );

    const report = reportOf(plan);

    expect(report.totals).toEqual({
      familyCount: 1,
      childCount: 2,
      movableMinor: 800_000,
      notMovedMinor: 40_000,
    });
    expect(report.families[0]).not.toHaveProperty('guardianId');
    expect(report.families[0]?.children[0]).not.toHaveProperty('campusId');
  });

  it('is empty when there is no credit', () => {
    expect(reportOf(planCreditMigration(facts({ students: [] })))).toEqual({
      families: [],
      notMoved: [],
      totals: {
        familyCount: 0,
        childCount: 0,
        movableMinor: 0,
        notMovedMinor: 0,
      },
    });
  });
});

describe('matchesReviewed', () => {
  const plan = planCreditMigration(facts());

  it('accepts the figures the person read', () => {
    expect(
      matchesReviewed(plan, {
        expectedFamilies: 1,
        expectedTotalMinor: 500_000,
      })
    ).toBe(true);
  });

  it.each([
    { expectedFamilies: 2, expectedTotalMinor: 500_000 },
    { expectedFamilies: 1, expectedTotalMinor: 499_999 },
  ])('refuses %o', (reviewed) => {
    expect(matchesReviewed(plan, reviewed)).toBe(false);
  });
});
