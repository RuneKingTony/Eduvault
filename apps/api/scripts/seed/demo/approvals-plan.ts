import {
  AMOUNT_STEP_MINOR,
  roundDown,
  termChargeMinor,
  type FamilyPayment,
  type WalletPlan,
} from './money-plan';
import type { DemoFamily, FamilyNumber, StudentNumber } from './people-plan';
import type { Random } from './prng';

export type ApprovalState = 'approved' | 'pending' | 'declined';
export type AdjustmentKindPlan = 'credit_note' | 'write_off' | 'refund';

interface Decided {
  state: ApprovalState;
  daysAgo: number;
  /** Null while the request is waiting. */
  decidedDaysAgo: number | null;
  declineReason: string | null;
}

export interface DiscountPlan extends Decided {
  student: StudentNumber;
  kind: 'percent' | 'fixed';
  value: number;
  reason: string;
}

export interface AdjustmentPlan extends Decided {
  kind: AdjustmentKindPlan;
  student: StudentNumber;
  amountMinor: number;
  reason: string;
}

export interface VoidPlan extends Decided {
  family: FamilyNumber;
  reason: string;
}

export interface ApprovalsPlan {
  discounts: DiscountPlan[];
  adjustments: AdjustmentPlan[];
  voids: VoidPlan[];
}

export const emptyApprovalsPlan = (): ApprovalsPlan => ({
  discounts: [],
  adjustments: [],
  voids: [],
});

const REQUEST_WINDOW_DAYS = { newest: 4, oldest: 20 };
const VOID_DAYS_AFTER_PAYMENT = 1;

const WRITE_OFF_STATES: readonly ApprovalState[] = [
  'approved',
  'approved',
  'pending',
  'declined',
];
const CREDIT_NOTE_STATES: readonly ApprovalState[] = [
  'approved',
  'approved',
  'pending',
];
const VOID_STATES: readonly ApprovalState[] = [
  'approved',
  'declined',
  'pending',
  'pending',
];

const WRITE_OFF_REASONS = [
  'Family moved abroad; the balance will not be paid',
  'Guardian passed away; the family asked us to forgive the balance',
  'Hardship agreed with the principal',
  'Balance is under dispute and the family will not pay',
];
const CREDIT_NOTE_REASONS = [
  'Late enrolment',
  'Bus fee charged but the child walks to school',
  'Fees overlapped with a sibling’s scholarship',
];
const REFUND_REASON = 'Fees were paid twice; refund the extra to the family';
const VOID_REASONS = [
  'Keyed against the wrong child. Please cancel the receipt.',
  'Transfer slip was for another family.',
  'Amount was entered wrongly; the family will pay again.',
  'Duplicate receipt for the same transfer.',
];
const ADJUSTMENT_DECLINE = 'Ask the family to pay in instalments first';
const VOID_DECLINE = 'The receipt matches the bank statement';
const DISCOUNT_DECLINE = 'Hardship cases go through the bursary application';

interface Candidate {
  student: StudentNumber;
  family: FamilyNumber;
  dueMinor: number;
  owedMinor: number;
  creditMinor: number;
}

function candidatesOf(
  families: readonly DemoFamily[],
  options: {
    payments: readonly FamilyPayment[];
    wallets: readonly WalletPlan[];
  }
): Candidate[] {
  const walletFamilies = new Set(options.wallets.map((row) => row.family));
  const paidBy = new Map(options.payments.map((row) => [row.family, row]));
  return families
    .filter((family) => !walletFamilies.has(family.number))
    .flatMap((family) =>
      family.children.map((child) => {
        const dueMinor = termChargeMinor(child.level);
        const paidMinor =
          paidBy
            .get(family.number)
            ?.allocations.find((row) => row.child === child.number)
            ?.amountMinor ?? 0;
        return {
          student: child.number,
          family: family.number,
          dueMinor,
          owedMinor: Math.max(0, dueMinor - paidMinor),
          creditMinor: Math.max(0, paidMinor - dueMinor),
        };
      })
    );
}

function take(
  pool: readonly Candidate[],
  count: number,
  used: Set<StudentNumber>
): Candidate[] {
  const chosen = pool
    .filter((candidate) => !used.has(candidate.student))
    .slice(0, count);
  for (const candidate of chosen) {
    used.add(candidate.student);
  }
  return chosen;
}

function decision(
  state: ApprovalState,
  request: { daysAgo: number; random: Random; declineReason: string }
): Decided {
  const { daysAgo, random, declineReason } = request;
  return {
    state,
    daysAgo,
    decidedDaysAgo:
      state === 'pending' ? null : Math.max(1, daysAgo - random.between(0, 2)),
    declineReason: state === 'declined' ? declineReason : null,
  };
}

const requestDay = (random: Random): number =>
  random.between(REQUEST_WINDOW_DAYS.newest, REQUEST_WINDOW_DAYS.oldest);

function planAdjustments(
  candidates: readonly Candidate[],
  random: Random
): AdjustmentPlan[] {
  const used = new Set<StudentNumber>();
  const shuffled = random.shuffle(candidates);
  const refunds = take(
    shuffled.filter((row) => row.creditMinor >= 2 * AMOUNT_STEP_MINOR),
    1,
    used
  );
  const writeOffs = take(
    shuffled.filter((row) => row.owedMinor >= 4 * AMOUNT_STEP_MINOR),
    WRITE_OFF_STATES.length,
    used
  );
  const creditNotes = take(
    shuffled.filter((row) => row.owedMinor > 0),
    CREDIT_NOTE_STATES.length,
    used
  );
  const decided = (state: ApprovalState | undefined) =>
    decision(state ?? 'pending', {
      daysAgo: requestDay(random),
      random,
      declineReason: ADJUSTMENT_DECLINE,
    });
  return [
    ...refunds.map((row): AdjustmentPlan => ({
      kind: 'refund',
      student: row.student,
      amountMinor: Math.max(AMOUNT_STEP_MINOR, roundDown(row.creditMinor / 2)),
      reason: REFUND_REASON,
      ...decided('approved'),
    })),
    ...writeOffs.map((row, index): AdjustmentPlan => ({
      kind: 'write_off',
      student: row.student,
      amountMinor: Math.max(
        AMOUNT_STEP_MINOR,
        roundDown((row.owedMinor * random.between(25, 70)) / 100)
      ),
      reason: WRITE_OFF_REASONS[index % WRITE_OFF_REASONS.length] ?? '',
      ...decided(WRITE_OFF_STATES[index]),
    })),
    ...creditNotes.map((row, index): AdjustmentPlan => ({
      kind: 'credit_note',
      student: row.student,
      amountMinor: Math.max(
        AMOUNT_STEP_MINOR,
        roundDown((row.dueMinor * random.between(5, 20)) / 100)
      ),
      reason: CREDIT_NOTE_REASONS[index % CREDIT_NOTE_REASONS.length] ?? '',
      ...decided(CREDIT_NOTE_STATES[index]),
    })),
  ];
}

function planVoids(
  payments: readonly FamilyPayment[],
  options: { exclude: ReadonlySet<FamilyNumber>; random: Random }
): VoidPlan[] {
  const { exclude, random } = options;
  const eligible = random.shuffle(
    payments.filter(
      (payment) =>
        payment.amountMinor > 0 &&
        payment.behaviour !== 'overpaid' &&
        payment.daysAgo > VOID_DAYS_AFTER_PAYMENT + 1 &&
        !exclude.has(payment.family)
    )
  );
  return eligible
    .slice(0, VOID_STATES.length)
    .map((payment, index): VoidPlan => ({
      family: payment.family,
      reason: VOID_REASONS[index % VOID_REASONS.length] ?? '',
      ...decision(VOID_STATES[index] ?? 'pending', {
        daysAgo: random.between(1, payment.daysAgo - VOID_DAYS_AFTER_PAYMENT),
        random,
        declineReason: VOID_DECLINE,
      }),
    }));
}

export interface MoneyApprovals {
  adjustments: AdjustmentPlan[];
  voids: VoidPlan[];
}

/** Adjustments and voids stay off the wallet sample, and a void never lands on a family that has an adjustment. */
export function planMoneyApprovals(
  families: readonly DemoFamily[],
  options: {
    payments: readonly FamilyPayment[];
    wallets: readonly WalletPlan[];
    random: Random;
  }
): MoneyApprovals {
  const { payments, wallets, random } = options;
  const adjustments = planAdjustments(
    candidatesOf(families, { payments, wallets }),
    random
  );
  const adjusted = new Set(adjustments.map((row) => row.student));
  const exclude = new Set<FamilyNumber>(wallets.map((row) => row.family));
  for (const family of families) {
    if (family.children.some((child) => adjusted.has(child.number))) {
      exclude.add(family.number);
    }
  }
  return { adjustments, voids: planVoids(payments, { exclude, random }) };
}

const DISCOUNTS: readonly Pick<
  DiscountPlan,
  'kind' | 'value' | 'reason' | 'state'
>[] = [
  {
    kind: 'percent',
    value: 25,
    reason: 'Academic scholarship for the year',
    state: 'approved',
  },
  {
    kind: 'fixed',
    value: 1_500_000,
    reason: 'Sibling discount for the third child',
    state: 'approved',
  },
  {
    kind: 'percent',
    value: 10,
    reason: 'Early payment arrangement agreed with the bursar',
    state: 'pending',
  },
  {
    kind: 'fixed',
    value: 5_000_000,
    reason: 'Hardship reduction requested by the family',
    state: 'declined',
  },
];

export function planDiscounts(
  students: readonly StudentNumber[],
  random: Random
): DiscountPlan[] {
  const chosen = random.shuffle(students);
  return DISCOUNTS.flatMap((spec, index): DiscountPlan[] => {
    const student = chosen[index];
    return student === undefined
      ? []
      : [
          {
            student,
            kind: spec.kind,
            value: spec.value,
            reason: spec.reason,
            ...decision(spec.state, {
              daysAgo: requestDay(random),
              random,
              declineReason: DISCOUNT_DECLINE,
            }),
          },
        ];
  });
}
