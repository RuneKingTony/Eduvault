import { DEMO_ARM_COUNT } from './config';
import { levelSubjects } from './lists';
import {
  autoPayCount,
  behaviourCounts,
  splitByWeight,
  walletSampleSize,
  type Behaviour,
} from './money-plan';
import { buildDemoPlan, type DemoPlan } from './plan';

const TODAY = '2026-10-07';
const FULL = { students: 600, teachers: 30 };
const SMALL = { students: 40, teachers: 4 };

const full = buildDemoPlan(FULL, TODAY);
const small = buildDemoPlan(SMALL, TODAY);

const childrenOf = (plan: DemoPlan) =>
  plan.families.flatMap((family) => family.children);

const behaviourTally = (plan: DemoPlan): Record<Behaviour, number> => {
  const tally = { paid: 0, part: 0, owing: 0, overpaid: 0 };
  for (const payment of plan.payments) {
    tally[payment.behaviour] += 1;
  }
  return tally;
};

describe('buildDemoPlan', () => {
  it('gives the same school for the same inputs and a different one for another size', () => {
    expect(buildDemoPlan(FULL, TODAY)).toEqual(full);
    expect(buildDemoPlan(SMALL, TODAY)).toEqual(small);
    expect(full).not.toEqual(small);
  });

  it.each([
    ['full size', full, FULL],
    ['small size', small, SMALL],
  ])('matches the requested sizes at %s', (_label, plan, size) => {
    expect(childrenOf(plan)).toHaveLength(size.students);
    expect(plan.teachers).toHaveLength(size.teachers);
    expect(plan.arms).toHaveLength(DEMO_ARM_COUNT);
    expect(plan.leaders.map((leader) => leader.key)).toEqual([
      'principal',
      'bursar-main',
      'bursar-annex',
    ]);
    const numbers = childrenOf(plan).map((child) => child.number);
    expect(numbers).toEqual(
      Array.from({ length: size.students }, (_, index) => index + 1)
    );
  });

  it('puts every student in a class and gives every family one paying guardian', () => {
    for (const plan of [full, small]) {
      for (const family of plan.families) {
        expect(family.guardians.length).toBeGreaterThanOrEqual(1);
        expect(family.guardians.length).toBeLessThanOrEqual(2);
        expect(family.guardians.filter((row) => row.paysFees)).toHaveLength(1);
        for (const child of family.children) {
          const arm = plan.arms[child.arm];
          expect(arm?.level).toBe(child.level);
          expect(arm?.campus).toBe(family.campus);
          expect(child.dateOfBirth <= TODAY).toBe(true);
          expect(child.lastName).toBe(family.surname);
        }
      }
    }
  });

  it('keeps siblings together, with distinct names and classes', () => {
    const siblings = full.families.filter((row) => row.children.length > 1);
    expect(siblings.length).toBeGreaterThan(50);
    for (const family of siblings) {
      const names = family.children.map((child) => child.firstName);
      const levels = family.children.map((child) => child.level.code);
      expect(new Set(names).size).toBe(names.length);
      expect(new Set(levels).size).toBe(levels.length);
    }
  });

  it('shapes families the way the design describes', () => {
    const twoGuardian = full.families
      .filter((row) => row.guardians.length === 2)
      .reduce((total, row) => total + row.children.length, 0);
    expect(twoGuardian / FULL.students).toBeGreaterThan(0.6);
    expect(twoGuardian / FULL.students).toBeLessThan(0.8);
    expect(full.families.length).toBeGreaterThan(400);
    expect(full.families.length).toBeLessThan(500);
  });

  it('spreads students evenly over the classes', () => {
    for (const plan of [full, small]) {
      const sizes = plan.arms.map(
        (arm) =>
          childrenOf(plan).filter((child) => child.arm === arm.index).length
      );
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(2);
    }
    const sizes = full.arms.map(
      (arm) =>
        childrenOf(full).filter((child) => child.arm === arm.index).length
    );
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(23);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(27);
  });

  it('makes the wallet payers, and only them, sign in with an email', () => {
    const emailed = full.families.flatMap((family) =>
      family.guardians.filter((row) => row.email !== null)
    );
    expect(emailed).toHaveLength(full.wallets.length);
    expect(new Set(emailed.map((row) => row.email)).size).toBe(emailed.length);
    for (const wallet of full.wallets) {
      const family = full.families.find((row) => row.number === wallet.family);
      expect(
        family?.guardians.find((row) => row.paysFees)?.email
      ).not.toBeNull();
    }
  });
});

describe('subject teachers', () => {
  it.each([
    ['full size', full],
    ['small size', small],
  ])('give each class and subject one teacher at %s', (_label, plan) => {
    const seen = new Set<string>();
    for (const row of plan.subjectTeachers) {
      const arm = plan.arms[row.arm];
      const teacher = plan.teachers[row.teacher];
      expect(teacher?.campuses).toEqual([arm?.campus]);
      expect(teacher?.subjects).toContain(row.subject);
      expect(
        levelSubjects(arm?.level.code ?? '').some(
          (entry) => entry.subject === row.subject
        )
      ).toBe(true);
      const key = `${row.arm}:${row.subject}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    const idle = plan.teachers.filter(
      (teacher) =>
        !plan.subjectTeachers.some((row) => row.teacher === teacher.index)
    );
    expect(idle.map((teacher) => teacher.key)).toEqual([]);
  });

  it('makes 24 teachers lead one class each at full size, and every small-size teacher a lead', () => {
    const leads = full.teachers.filter((row) => row.leadsArm !== null);
    expect(leads).toHaveLength(24);
    expect(new Set(leads.map((row) => row.leadsArm)).size).toBe(24);
    expect(small.teachers.every((row) => row.leadsArm !== null)).toBe(true);
    for (const teacher of full.teachers) {
      expect(teacher.subjects.length).toBeGreaterThanOrEqual(1);
      expect(teacher.subjects.length).toBeLessThanOrEqual(2);
    }
    for (const teacher of leads) {
      expect(teacher.campuses).toEqual([
        full.arms[teacher.leadsArm ?? 0]?.campus,
      ]);
    }
  });
});

describe('payment plan', () => {
  it('holds the 35/30/25/10 mix at full size', () => {
    const families = full.families.length;
    const tally = behaviourTally(full);
    expect(tally).toEqual(behaviourCounts(families));
    expect(tally.paid / families).toBeCloseTo(0.35, 1);
    expect(tally.part / families).toBeCloseTo(0.3, 1);
    expect(tally.owing / families).toBeCloseTo(0.25, 1);
    expect(tally.overpaid / families).toBeCloseTo(0.1, 1);
  });

  it('never pays more than a family can sensibly owe, and credits only the overpaid', () => {
    for (const payment of full.payments) {
      const total = payment.allocations.reduce(
        (sum, row) => sum + row.amountMinor,
        0
      );
      expect(total).toBe(payment.amountMinor);
      expect(payment.allocations.every((row) => row.amountMinor > 0)).toBe(
        true
      );
      expect(payment.daysAgo).toBeGreaterThanOrEqual(2);
    }
    const margin = (behaviour: Behaviour) =>
      full.payments
        .filter((payment) => payment.behaviour === behaviour)
        .map((payment) => Math.sign(payment.amountMinor - payment.dueMinor));
    expect(new Set(margin('owing'))).toEqual(new Set([-1]));
    expect(new Set(margin('part'))).toEqual(new Set([-1]));
    expect(new Set(margin('paid'))).toEqual(new Set([0]));
    expect(new Set(margin('overpaid'))).toEqual(new Set([1]));
    expect(
      full.payments
        .filter((payment) => payment.behaviour === 'owing')
        .map((payment) => payment.amountMinor)
    ).toEqual(
      full.payments
        .filter((payment) => payment.behaviour === 'owing')
        .map(() => 0)
    );
    expect(
      Math.min(
        ...full.payments
          .filter((payment) => payment.behaviour === 'part')
          .map((payment) => payment.amountMinor)
      )
    ).toBeGreaterThan(0);
  });

  it('lets only part-paid and owing families into the wallet sample', () => {
    for (const wallet of full.wallets) {
      const payment = full.payments.find((row) => row.family === wallet.family);
      expect(['part', 'owing']).toContain(payment?.behaviour);
    }
  });

  it('puts every behaviour in a small school at least once', () => {
    const tally = behaviourTally(small);
    for (const behaviour of ['paid', 'part', 'owing', 'overpaid'] as const) {
      expect(tally[behaviour]).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('wallet plan', () => {
  it('samples 60 guardians at full size, 10 on auto-pay, and scales down', () => {
    expect(full.wallets).toHaveLength(60);
    expect(walletSampleSize(600)).toBe(60);
    expect(autoPayCount(60)).toBe(10);
    expect(full.wallets.filter((row) => row.autoPay !== null)).toHaveLength(10);
    expect(small.wallets).toHaveLength(walletSampleSize(40));
    expect(small.wallets).toHaveLength(4);
    expect(small.wallets.filter((row) => row.autoPay !== null)).toHaveLength(
      autoPayCount(4)
    );
    expect(autoPayCount(4)).toBeGreaterThanOrEqual(1);
  });

  it('sets money aside for about a third of the others, never an auto-pay guardian', () => {
    const others = full.wallets.filter((row) => row.autoPay === null);
    const asides = others.filter((row) => row.setAside !== null);
    expect(asides.length).toBeGreaterThan(others.length / 6);
    expect(asides.length).toBeLessThan(others.length / 2);
    expect(
      full.wallets.filter(
        (row) => row.autoPay !== null && row.setAside !== null
      )
    ).toHaveLength(0);
  });

  it('only spends what the top-up and the child can bear, and never before the family paid', () => {
    for (const [plan, wallets] of [
      [full, full.wallets],
      [small, small.wallets],
    ] as const) {
      for (const wallet of wallets) {
        const payment = plan.payments.find(
          (row) => row.family === wallet.family
        );
        const paid = payment?.allocations.find(
          (row) => row.child === wallet.spend.child
        );
        expect(wallet.spend.amountMinor).toBeGreaterThan(0);
        expect(wallet.topUpMinor).toBeGreaterThan(wallet.spend.amountMinor);
        expect(wallet.daysAgo).toBeGreaterThanOrEqual(1);
        expect(wallet.daysAgo).toBeLessThanOrEqual(
          payment !== undefined && payment.amountMinor > 0
            ? payment.daysAgo
            : Number.POSITIVE_INFINITY
        );
        expect(paid?.amountMinor ?? 0).toBeLessThan(payment?.dueMinor ?? 0);
      }
    }
  });

  it('spends on a child of the family, and sets aside no more than is left', () => {
    for (const wallet of full.wallets) {
      const family = full.families.find((row) => row.number === wallet.family);
      expect(family?.children.map((row) => row.number)).toContain(
        wallet.spend.child
      );
    }
    for (const wallet of full.wallets.filter((row) => row.setAside !== null)) {
      expect(
        wallet.spend.amountMinor + (wallet.setAside?.amountMinor ?? 0)
      ).toBeLessThanOrEqual(wallet.topUpMinor);
    }
  });
});

describe('behaviourCounts', () => {
  it('splits 100 families exactly by the shares', () => {
    expect(behaviourCounts(100)).toEqual({
      paid: 35,
      part: 30,
      owing: 25,
      overpaid: 10,
    });
  });

  it.each([4, 7, 13, 30, 99, 444])(
    'adds up to %i and gives every behaviour a family',
    (families) => {
      const counts = behaviourCounts(families);
      expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(families);
      expect(Math.min(...Object.values(counts))).toBeGreaterThanOrEqual(1);
    }
  );
});

describe('splitByWeight', () => {
  it('shares a total by weight in whole steps, adding up exactly', () => {
    const shares = splitByWeight(1_250_000, [3, 1]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1_250_000);
    expect(shares[0]).toBeGreaterThan(shares[1] ?? 0);
  });
});

describe('wallet requests', () => {
  it.each([
    ['full size', full],
    ['small size', small],
  ])(
    'plans a refund and a cancellation in each state at %s',
    (_label, plan) => {
      expect(
        plan.walletRequests.map((row) => `${row.kind}|${row.state}`)
      ).toEqual([
        'refund|approved',
        'refund|pending',
        'refund|declined',
        'cancellation|approved',
        'cancellation|pending',
        'cancellation|declined',
      ]);
    }
  );

  it.each([
    ['full size', full],
    ['small size', small],
  ])(
    'puts every request on a wallet without auto-pay at %s',
    (_label, plan) => {
      const plain = new Set(
        plan.wallets
          .filter((row) => row.autoPay === null)
          .map((row) => row.number)
      );
      for (const request of plan.walletRequests) {
        expect(plain.has(request.wallet)).toBe(true);
        expect(request.decidedDaysAgo === null).toBe(
          request.state === 'pending'
        );
      }
    }
  );
});
