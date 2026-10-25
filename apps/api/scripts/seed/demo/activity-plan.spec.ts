import { addDays, isWeekend } from '@eduvault/shared';
import { DEMO_ARM_COUNT, midTermDays } from './config';
import {
  planPayments,
  planWallets,
  termChargeMinor,
  type FamilyPayment,
} from './money-plan';
import {
  buildFamilies,
  buildTeachers,
  type FamilyNumber,
  type StudentNumber,
} from './people-plan';
import { buildDemoPlan, DEMO_SEED, type DemoPlan } from './plan';
import { createRandom } from './prng';
import { STORE_ITEMS, openingQuantity } from './store-plan';

const TODAY = '2026-10-07';
const FULL = { students: 600, teachers: 30 };
const SMALL = { students: 40, teachers: 4 };
const SMALLEST = { students: DEMO_ARM_COUNT, teachers: 1 };

const full = buildDemoPlan(FULL, TODAY);
const small = buildDemoPlan(SMALL, TODAY);
const smallest = buildDemoPlan(SMALLEST, TODAY);

const plans = [
  ['full size', full],
  ['small size', small],
] as const;

const children = (plan: DemoPlan) =>
  plan.families.flatMap((family) =>
    family.children.map((child) => ({ child, family }))
  );

const walletKids = (plan: DemoPlan): StudentNumber[] => {
  const families = new Set(plan.wallets.map((wallet) => wallet.family));
  return children(plan)
    .filter(({ family }) => families.has(family.number))
    .map(({ child }) => child.number);
};

const kidsOf = (plan: DemoPlan, families: readonly FamilyNumber[]) =>
  children(plan)
    .filter(({ family }) => families.includes(family.number))
    .map(({ child }) => child.number);

const lifeStudents = (plan: DemoPlan): StudentNumber[] =>
  [
    ...plan.studentLife.inactive,
    ...plan.studentLife.away,
    ...plan.studentLife.left,
  ].map((row) => row.student);

const overlap = (
  left: readonly StudentNumber[],
  right: readonly StudentNumber[]
): StudentNumber[] => left.filter((student) => right.includes(student));

const countBy = <T>(rows: readonly T[], key: (row: T) => string) => {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[key(row)] = (counts[key(row)] ?? 0) + 1;
  }
  return counts;
};

describe('the school activity plan', () => {
  it('is the same for the same inputs', () => {
    expect(buildDemoPlan(FULL, TODAY)).toEqual(full);
    expect(buildDemoPlan(SMALL, TODAY)).toEqual(small);
  });

  it.each(plans)(
    'leaves the teachers, families, payments and wallets the new draws never touch (%s)',
    (_label, plan) => {
      const random = createRandom(DEMO_SEED);
      const teachers = buildTeachers(plan.size.teachers, random);
      const built = buildFamilies(plan.size.students, { today: TODAY, random });
      const payments = planPayments(built, random);
      const wallets = planWallets(built, payments, {
        students: plan.size.students,
        random,
      });
      expect(plan.teachers).toEqual(teachers);
      expect(plan.payments).toEqual(payments);
      expect(plan.wallets).toEqual(wallets);
      expect(
        plan.families.map((family) => ({
          ...family,
          guardians: family.guardians.map((guardian) => ({
            ...guardian,
            email: null,
          })),
        }))
      ).toEqual(
        built.map((family) => ({
          ...family,
          guardians: family.guardians.map((guardian) => ({
            ...guardian,
            email: null,
          })),
        }))
      );
    }
  );
});

describe('the store plan', () => {
  it('has about two dozen items with unique keys, textbooks only for levels', () => {
    expect(STORE_ITEMS).toHaveLength(24);
    expect(new Set(STORE_ITEMS.map((item) => item.key)).size).toBe(24);
    for (const item of STORE_ITEMS) {
      expect(item.priceMinor).toBeGreaterThanOrEqual(item.costMinor);
      expect(item.kind === 'book').toBe(item.levelCode !== null);
    }
  });

  it.each(plans)(
    'plans 40 cash or transfer sales in date order, and a count for each campus (%s)',
    (_label, plan) => {
      const { sales, counts } = plan.store;
      expect(sales).toHaveLength(40);
      expect(sales.map((sale) => sale.number)).toEqual(
        Array.from({ length: 40 }, (_, index) => index + 1)
      );
      expect(sales.map((sale) => sale.daysAgo)).toEqual(
        sales.map((sale) => sale.daysAgo).toSorted((a, b) => b - a)
      );
      expect(new Set(sales.map((sale) => sale.method))).toEqual(
        new Set(['cash', 'transfer'])
      );
      expect(Math.min(...sales.map((sale) => sale.daysAgo))).toBeGreaterThan(0);
      expect(
        Math.max(...sales.map((sale) => sale.daysAgo))
      ).toBeLessThanOrEqual(35);
      expect(counts.map((count) => [count.campus, count.decision])).toEqual([
        ['Main', 'waiting'],
        ['Annex', 'approved'],
      ]);
      for (const count of counts) {
        expect(count.lines.length).toBeGreaterThan(0);
        for (const line of count.lines) {
          expect(line.missing).toBeGreaterThan(0);
          expect(line.held).toBeGreaterThan(line.missing);
        }
      }
    }
  );

  it.each(plans)(
    'sells to the buyer’s own campus, never twice an item in one sale or more than the opening stock holds (%s)',
    (_label, plan) => {
      const campusOf = new Map(
        children(plan).map(({ child, family }) => [child.number, family.campus])
      );
      const sold = new Map<string, number>();
      for (const sale of plan.store.sales) {
        expect(sale.campus).toBe(campusOf.get(sale.student));
        const items = sale.lines.map((line) => line.item);
        expect(new Set(items).size).toBe(items.length);
        for (const line of sale.lines) {
          const key = `${sale.campus}|${line.item}`;
          sold.set(key, (sold.get(key) ?? 0) + line.quantity);
        }
      }
      for (const [key, quantity] of sold) {
        const [campus, item] = key.split('|');
        const index = STORE_ITEMS.findIndex((row) => row.key === item);
        expect(quantity).toBeLessThanOrEqual(
          openingQuantity(index, campus === 'Main' ? 'Main' : 'Annex')
        );
      }
    }
  );
});

const owedBy = (plan: DemoPlan, student: StudentNumber): number => {
  const owner = children(plan).find(({ child }) => child.number === student);
  if (owner === undefined) {
    throw new Error(`The plan has no student ${student}.`);
  }
  const payment = plan.payments.find(
    (row) => row.family === owner.family.number
  );
  const paid =
    payment?.allocations.find((row) => row.child === student)?.amountMinor ?? 0;
  return termChargeMinor(owner.child.level) - paid;
};

describe('the approvals plan', () => {
  it.each(plans)('has every kind and state (%s)', (_label, plan) => {
    const { discounts, adjustments, voids } = plan.approvals;
    expect(countBy(discounts, (row) => row.state)).toEqual({
      approved: 2,
      pending: 1,
      declined: 1,
    });
    expect(countBy(adjustments, (row) => `${row.kind}:${row.state}`)).toEqual({
      'refund:approved': 1,
      'write_off:approved': 2,
      'write_off:pending': 1,
      'write_off:declined': 1,
      'credit_note:approved': 2,
      'credit_note:pending': 1,
    });
    expect(countBy(voids, (row) => row.state)).toEqual({
      approved: 1,
      declined: 1,
      pending: 2,
    });
  });

  it.each(plans)(
    'writes off no more than is owed, refunds no more than the credit (%s)',
    (_label, plan) => {
      const { adjustments } = plan.approvals;
      for (const row of adjustments.filter((r) => r.kind === 'write_off')) {
        expect(row.amountMinor).toBeLessThanOrEqual(owedBy(plan, row.student));
      }
      for (const row of adjustments.filter((r) => r.kind === 'refund')) {
        expect(row.amountMinor).toBeLessThanOrEqual(-owedBy(plan, row.student));
      }
      expect(adjustments.every((row) => row.amountMinor > 0)).toBe(true);
    }
  );

  it.each(plans)(
    'decides on the day of the request or after it, and only declined items carry a reason (%s)',
    (_label, plan) => {
      const { discounts, adjustments, voids } = plan.approvals;
      const asked = [...discounts, ...adjustments, ...voids];
      expect(asked.map((row) => row.decidedDaysAgo === null)).toEqual(
        asked.map((row) => row.state === 'pending')
      );
      expect(asked.map((row) => row.declineReason !== null)).toEqual(
        asked.map((row) => row.state === 'declined')
      );
      for (const row of asked.filter((r) => r.decidedDaysAgo !== null)) {
        expect(row.decidedDaysAgo).toBeLessThanOrEqual(row.daysAgo);
        expect(row.decidedDaysAgo).toBeGreaterThanOrEqual(1);
      }
    }
  );

  it.each(plans)(
    'cancels only real payments, after they were made (%s)',
    (_label, plan) => {
      for (const row of plan.approvals.voids) {
        const payment = plan.payments.find(
          (candidate: FamilyPayment) => candidate.family === row.family
        );
        expect(payment?.amountMinor).toBeGreaterThan(0);
        expect(row.daysAgo).toBeLessThan(payment?.daysAgo ?? 0);
      }
    }
  );
});

describe('no student plays two incompatible roles', () => {
  it.each(plans)('keeps the roles apart (%s)', (_label, plan) => {
    const wallets = walletKids(plan);
    const adjusted = plan.approvals.adjustments.map((row) => row.student);
    const voided = kidsOf(
      plan,
      plan.approvals.voids.map((row) => row.family)
    );
    const buyers = plan.store.sales.map((sale) => sale.student);
    const discounted = plan.approvals.discounts.map((row) => row.student);
    const life = lifeStudents(plan);
    expect(new Set(adjusted).size).toBe(adjusted.length);
    expect(overlap(adjusted, wallets)).toEqual([]);
    expect(overlap(voided, wallets)).toEqual([]);
    expect(overlap(voided, adjusted)).toEqual([]);
    expect(overlap(buyers, wallets)).toEqual([]);
    for (const others of [wallets, adjusted, voided, buyers, discounted]) {
      expect(overlap(life, others)).toEqual([]);
    }
    const { graduated } = plan.studentLife;
    expect(overlap(graduated, life)).toEqual([]);
    for (const others of [wallets, adjusted, voided, buyers, discounted]) {
      expect(overlap(graduated, others)).toEqual([]);
    }
  });
});

describe('the announcements plan', () => {
  it('has about ten, by audience and status', () => {
    const { announcements } = full;
    expect(announcements).toHaveLength(11);
    const published = announcements.filter((row) => row.status === 'published');
    expect(published.filter((row) => row.campus === null)).toHaveLength(4);
    expect(published.filter((row) => row.campus !== null)).toHaveLength(4);
    expect(announcements.filter((row) => row.status === 'draft')).toHaveLength(
      1
    );
    expect(
      announcements.filter((row) => row.status === 'withdrawn')
    ).toHaveLength(2);
    expect(announcements.filter((row) => row.pinned)).toHaveLength(1);
    expect(announcements.filter((row) => row.viaDraft).length).toBeGreaterThan(
      0
    );
    expect(Math.max(...announcements.map((row) => row.daysAgo))).toBeLessThan(
      43
    );
    for (const row of announcements.filter((candidate) => candidate.pinned)) {
      expect(row.status).toBe('published');
    }
  });
});

describe('the leave plan', () => {
  it.each(plans)(
    'has every state and stays within the teachers (%s)',
    (_l, plan) => {
      expect(countBy(plan.leave, (row) => row.outcome)).toEqual({
        approved: 7,
        pending: 2,
        declined: 1,
        withdrawn: 1,
        cancelled: 1,
      });
      const approved = plan.leave.filter((row) => row.outcome === 'approved');
      expect(approved.some((row) => row.endsOn < TODAY)).toBe(true);
      expect(
        approved.some((row) => row.startsOn <= TODAY && row.endsOn >= TODAY)
      ).toBe(true);
      expect(approved.some((row) => row.startsOn > TODAY)).toBe(true);
      expect(
        plan.leave.every((row) => row.teacher < plan.teachers.length)
      ).toBe(true);
    }
  );

  it.each(plans)(
    'starts every request on a school day on or after the day it is made, and decides it later (%s)',
    (_label, plan) => {
      const holidays = midTermDays(TODAY);
      for (const row of plan.leave) {
        expect(row.startsOn >= addDays(TODAY, -row.createdDaysAgo)).toBe(true);
        expect(isWeekend(row.startsOn)).toBe(false);
        expect(holidays).not.toContain(row.startsOn);
        expect(row.endsOn >= row.startsOn).toBe(true);
        expect(row.decidedDaysAgo === null).toBe(row.outcome === 'pending');
      }
      for (const row of plan.leave.filter((r) => r.decidedDaysAgo !== null)) {
        expect(row.decidedDaysAgo ?? 0).toBeLessThanOrEqual(row.createdDaysAgo);
      }
      for (const row of plan.leave.filter((r) => r.outcome === 'cancelled')) {
        expect(
          addDays(TODAY, -(row.cancelledDaysAgo ?? 0)) < row.startsOn
        ).toBe(true);
      }
    }
  );

  it.each(plans)(
    'never overlaps two requests of one teacher (%s)',
    (_l, plan) => {
      const clashes = plan.leave.flatMap((row) =>
        plan.leave.filter(
          (other) =>
            other !== row &&
            other.teacher === row.teacher &&
            row.startsOn <= other.endsOn &&
            other.startsOn <= row.endsOn
        )
      );
      expect(clashes).toEqual([]);
    }
  );

  it('puts every request on the one teacher of the smallest school, where they can be kept apart', () => {
    expect(smallest.leave.length).toBeGreaterThan(0);
    expect(new Set(smallest.leave.map((row) => row.teacher))).toEqual(
      new Set([0])
    );
  });
});

describe('the student life plan', () => {
  it('marks 3 inactive, 4 not seen, 2 left, and graduates the final-year students nothing else needs at full size', () => {
    const { studentLife } = full;
    expect(studentLife.inactive).toHaveLength(3);
    expect(studentLife.away).toHaveLength(4);
    expect(studentLife.left).toHaveLength(2);
    const finalYear = children(full)
      .filter(({ child }) => child.level.code === 'SS3')
      .map(({ child }) => child.number);
    expect(studentLife.graduated.length).toBeGreaterThan(0);
    expect(studentLife.graduated.length).toBeLessThanOrEqual(finalYear.length);
    expect(overlap(studentLife.graduated, finalYear)).toEqual(
      studentLife.graduated
    );
  });

  it.each(plans)(
    'puts inactive students past the 35 days and away students inside them, and never in the final year (%s)',
    (_label, plan) => {
      for (const row of plan.studentLife.inactive) {
        expect(row.daysAgo).toBeGreaterThanOrEqual(35);
        expect(row.daysAgo).toBeLessThanOrEqual(37);
      }
      for (const row of plan.studentLife.away) {
        expect(row.daysAgo).toBeLessThan(35);
        expect(row.daysAgo).toBeGreaterThan(0);
      }
      const finalYear = new Set(
        children(plan)
          .filter(({ child }) => child.level.code === 'SS3')
          .map(({ child }) => child.number)
      );
      expect(
        lifeStudents(plan).filter((student) => finalYear.has(student))
      ).toEqual([]);
    }
  );

  it.each(plans)('shows every state at least once (%s)', (_label, plan) => {
    const { inactive, away, left, graduated } = plan.studentLife;
    for (const rows of [inactive, away, left, graduated]) {
      expect(rows.length).toBeGreaterThan(0);
    }
  });

  it('still plans something in the smallest school and never throws', () => {
    expect(smallest.store.sales.length).toBeGreaterThan(0);
    expect(smallest.approvals.discounts.length).toBeGreaterThan(0);
    expect(smallest.studentLife.inactive.length).toBeGreaterThan(0);
  });
});
