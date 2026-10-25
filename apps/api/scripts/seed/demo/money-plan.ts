import {
  familyOf,
  type DemoFamily,
  type DemoLevel,
  type FamilyNumber,
  type StudentNumber,
} from './people-plan';
import type { Random } from './prng';

/** A naira is 100 minor units; every planned amount is a whole ₦1,000. */
const AMOUNT_STEP_MINOR = 100_000;

const FEE_TYPE_CODES = {
  tuition: 4010,
  pta: 4020,
  bus: 4030,
  development: 4040,
  laboratory: 4050,
} as const;

interface FeeLinePlan {
  typeCode: number;
  name: string;
  amountMinor: number;
  optional: boolean;
}

const PRIMARY_TUITION = [
  8_000_000, 9_000_000, 10_000_000, 11_500_000, 12_500_000, 14_000_000,
];
const SECONDARY_TUITION = [
  17_000_000, 18_000_000, 19_000_000, 20_000_000, 21_000_000, 22_000_000,
];
const PTA_MINOR = 1_000_000;
const DEVELOPMENT_MINOR = 1_600_000;
const LABORATORY_MINOR = 2_000_000;
const BUS_MINOR = 3_500_000;

function tuitionFor(level: DemoLevel): number {
  const table = level.sequence <= 6 ? PRIMARY_TUITION : SECONDARY_TUITION;
  const offset = level.sequence <= 6 ? 1 : 7;
  return table[level.sequence - offset] ?? 0;
}

export function feeLinesFor(level: DemoLevel): FeeLinePlan[] {
  const lines: FeeLinePlan[] = [
    {
      typeCode: FEE_TYPE_CODES.tuition,
      name: `${level.name} Tuition`,
      amountMinor: tuitionFor(level),
      optional: false,
    },
    {
      typeCode: FEE_TYPE_CODES.pta,
      name: 'PTA fee',
      amountMinor: PTA_MINOR,
      optional: false,
    },
    {
      typeCode: FEE_TYPE_CODES.development,
      name: 'Development levy',
      amountMinor: DEVELOPMENT_MINOR,
      optional: false,
    },
    {
      typeCode: FEE_TYPE_CODES.bus,
      name: 'School bus',
      amountMinor: BUS_MINOR,
      optional: true,
    },
  ];
  if (level.sequence > 6) {
    lines.push({
      typeCode: FEE_TYPE_CODES.laboratory,
      name: 'Laboratory fee',
      amountMinor: LABORATORY_MINOR,
      optional: false,
    });
  }
  return lines;
}

export function termChargeMinor(level: DemoLevel): number {
  return feeLinesFor(level)
    .filter((line) => !line.optional)
    .reduce((total, line) => total + line.amountMinor, 0);
}

export type Behaviour = 'paid' | 'part' | 'owing' | 'overpaid';

const BEHAVIOUR_SHARES: Readonly<Record<Behaviour, number>> = {
  paid: 35,
  part: 30,
  owing: 25,
  overpaid: 10,
};

const BEHAVIOURS = Object.keys(BEHAVIOUR_SHARES) as Behaviour[];

export function behaviourCounts(families: number): Record<Behaviour, number> {
  const counts = { paid: 0, part: 0, owing: 0, overpaid: 0 };
  const remainders: { behaviour: Behaviour; remainder: number }[] = [];
  let assigned = 0;
  for (const behaviour of BEHAVIOURS) {
    const exact = (families * BEHAVIOUR_SHARES[behaviour]) / 100;
    counts[behaviour] = Math.floor(exact);
    assigned += counts[behaviour];
    remainders.push({ behaviour, remainder: exact - counts[behaviour] });
  }
  remainders.sort((left, right) => right.remainder - left.remainder);
  for (const next of remainders.slice(0, families - assigned)) {
    counts[next.behaviour] += 1;
  }
  if (families >= BEHAVIOURS.length) {
    for (const behaviour of BEHAVIOURS) {
      if (counts[behaviour] === 0) {
        counts[largestBehaviour(counts)] -= 1;
        counts[behaviour] = 1;
      }
    }
  }
  return counts;
}

function largestBehaviour(
  counts: Readonly<Record<Behaviour, number>>
): Behaviour {
  let largest: Behaviour = 'paid';
  for (const behaviour of BEHAVIOURS) {
    if (counts[behaviour] > counts[largest]) {
      largest = behaviour;
    }
  }
  return largest;
}

export interface Allocation {
  child: StudentNumber;
  amountMinor: number;
}

export type PaymentMethodPlan = 'cash' | 'transfer';

export interface FamilyPayment {
  family: FamilyNumber;
  behaviour: Behaviour;
  dueMinor: number;
  amountMinor: number;
  method: PaymentMethodPlan;
  daysAgo: number;
  allocations: Allocation[];
}

const TRANSFER_SHARE = 0.15;
const PAYMENT_WINDOW_DAYS = { newest: 2, oldest: 30 };

const roundDown = (minor: number): number =>
  Math.floor(minor / AMOUNT_STEP_MINOR) * AMOUNT_STEP_MINOR;

export function splitByWeight(
  total: number,
  weights: readonly number[]
): number[] {
  const weightTotal = weights.reduce((acc, weight) => acc + weight, 0);
  const shares = weights.map((weight) =>
    roundDown((total * weight) / weightTotal)
  );
  const left = total - shares.reduce((acc, share) => acc + share, 0);
  shares[0] = (shares[0] ?? 0) + left;
  return shares;
}

interface ChildDue {
  number: StudentNumber;
  dueMinor: number;
}

function duesOf(family: DemoFamily): ChildDue[] {
  return family.children.map((child) => ({
    number: child.number,
    dueMinor: termChargeMinor(child.level),
  }));
}

const totalDue = (rows: readonly { dueMinor: number }[]): number =>
  rows.reduce((total, row) => total + row.dueMinor, 0);

function allocate(
  behaviour: Behaviour,
  dues: readonly ChildDue[],
  random: Random
): Allocation[] {
  const total = totalDue(dues);
  if (behaviour === 'owing') {
    return [];
  }
  if (behaviour === 'paid') {
    return dues.map((due) => ({
      child: due.number,
      amountMinor: due.dueMinor,
    }));
  }
  if (behaviour === 'overpaid') {
    const extra = random.between(2, 20) * 10 * AMOUNT_STEP_MINOR;
    return dues.map((due, index) => ({
      child: due.number,
      amountMinor: due.dueMinor + (index === 0 ? extra : 0),
    }));
  }
  const paid = Math.max(
    AMOUNT_STEP_MINOR,
    roundDown((total * random.between(30, 70)) / 100)
  );
  const shares = splitByWeight(
    paid,
    dues.map((due) => due.dueMinor)
  );
  return dues.map((due, index) => ({
    child: due.number,
    amountMinor: shares[index] ?? 0,
  }));
}

function behaviourOrder(families: number, random: Random): Behaviour[] {
  const counts = behaviourCounts(families);
  return random.shuffle(
    BEHAVIOURS.flatMap((behaviour) =>
      Array.from({ length: counts[behaviour] }, () => behaviour)
    )
  );
}

export function planPayments(
  families: readonly DemoFamily[],
  random: Random
): FamilyPayment[] {
  const order = behaviourOrder(families.length, random);
  return families.map((family, index) => {
    const behaviour = order[index] ?? 'owing';
    const dues = duesOf(family);
    const allocations = allocate(behaviour, dues, random).filter(
      (row) => row.amountMinor > 0
    );
    return {
      family: family.number,
      behaviour,
      dueMinor: totalDue(dues),
      amountMinor: allocations.reduce((acc, row) => acc + row.amountMinor, 0),
      method: random.chance(TRANSFER_SHARE) ? 'transfer' : 'cash',
      daysAgo: random.between(
        PAYMENT_WINDOW_DAYS.newest,
        PAYMENT_WINDOW_DAYS.oldest
      ),
      allocations,
    };
  });
}

export interface WalletPlan {
  /** 1-based, and the number in the DEMO-TOPUP and DEMO-SPEND references. */
  number: number;
  family: FamilyNumber;
  method: PaymentMethodPlan;
  daysAgo: number;
  topUpMinor: number;
  spend: Allocation;
  setAside: Allocation | null;
  autoPay: { secondTopUpMinor: number } | null;
}

const WALLETS_PER_STUDENT = 0.1;
const AUTO_PAY_PER_WALLET = 1 / 6;
const SET_ASIDE_EVERY = 3;
const AUTO_PAY_MIN_TOP_UP_MINOR = 5 * AMOUNT_STEP_MINOR;
const AUTO_PAY_TOP_UP_SHARE = 0.3;
const WALLET_WINDOW_DAYS = { newest: 1, oldest: 10 };

export function walletSampleSize(students: number): number {
  return Math.max(1, Math.round(students * WALLETS_PER_STUDENT));
}

export function autoPayCount(wallets: number): number {
  return Math.min(
    wallets,
    Math.max(1, Math.round(wallets * AUTO_PAY_PER_WALLET))
  );
}

interface Owing {
  family: DemoFamily;
  paidDaysAgo: number | null;
  owed: { child: StudentNumber; owedMinor: number }[];
}

function owingOf(family: DemoFamily, payment: FamilyPayment): Owing {
  const paid = new Map(
    payment.allocations.map((row) => [row.child, row.amountMinor])
  );
  return {
    family,
    paidDaysAgo: payment.amountMinor > 0 ? payment.daysAgo : null,
    owed: duesOf(family).map((due) => ({
      child: due.number,
      owedMinor: due.dueMinor - (paid.get(due.number) ?? 0),
    })),
  };
}

function largestOwed(owed: Owing['owed']): Owing['owed'][number] {
  let largest = owed[0];
  for (const row of owed) {
    if (largest === undefined || row.owedMinor > largest.owedMinor) {
      largest = row;
    }
  }
  if (largest === undefined) {
    throw new Error('A family with no children cannot owe anything.');
  }
  return largest;
}

function planWallet(number: number, target: Owing, random: Random): WalletPlan {
  const child = largestOwed(target.owed);
  const spendMinor = Math.max(
    AMOUNT_STEP_MINOR,
    roundDown((child.owedMinor * random.between(25, 60)) / 100)
  );
  const topUpMinor =
    spendMinor +
    Math.max(
      AMOUNT_STEP_MINOR,
      roundDown((spendMinor * random.between(10, 70)) / 100)
    );
  const stillOwed = target.owed.map((row) =>
    row.child === child.child
      ? { ...row, owedMinor: row.owedMinor - spendMinor }
      : row
  );
  const left = largestOwed(stillOwed);
  const asideMinor = Math.min(
    roundDown((topUpMinor - spendMinor) / 2),
    roundDown(left.owedMinor / 2)
  );
  const owedAfterSpend = stillOwed.reduce(
    (total, row) => total + row.owedMinor,
    0
  );
  return {
    number,
    family: target.family.number,
    method: random.chance(TRANSFER_SHARE) ? 'transfer' : 'cash',
    daysAgo: random.between(
      WALLET_WINDOW_DAYS.newest,
      Math.min(
        WALLET_WINDOW_DAYS.oldest,
        target.paidDaysAgo ?? WALLET_WINDOW_DAYS.oldest
      )
    ),
    topUpMinor,
    spend: { child: child.child, amountMinor: spendMinor },
    setAside:
      number % SET_ASIDE_EVERY === 0 && asideMinor >= AMOUNT_STEP_MINOR
        ? { child: left.child, amountMinor: asideMinor }
        : null,
    autoPay: {
      secondTopUpMinor: Math.max(
        AUTO_PAY_MIN_TOP_UP_MINOR,
        roundDown(owedAfterSpend * AUTO_PAY_TOP_UP_SHARE)
      ),
    },
  };
}

export function planWallets(
  families: readonly DemoFamily[],
  payments: readonly FamilyPayment[],
  options: { students: number; random: Random }
): WalletPlan[] {
  const eligible: Owing[] = [];
  for (const payment of payments) {
    if (payment.behaviour === 'owing' || payment.behaviour === 'part') {
      eligible.push(owingOf(familyOf(families, payment.family), payment));
    }
  }
  const sample = options.random
    .shuffle(eligible)
    .slice(0, walletSampleSize(options.students));
  const withAutoPay = autoPayCount(sample.length);
  return sample.map((target, index) => {
    const plan = planWallet(index + 1, target, options.random);
    return index < withAutoPay
      ? { ...plan, setAside: null }
      : { ...plan, autoPay: null };
  });
}
