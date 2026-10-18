import {
  ADJUSTMENT_KIND_LABELS,
  type AdjustmentKind,
  type DiscountKind,
  type FeeLine,
} from '@eduvault/api-contract';
import { countOf, money } from '@eduvault/shared';
import type { StudentIdentity } from '../students';
import type { ActivityInput } from './activity-writer';
import { FEE_SCHEDULE_KINDS } from './fee-schedule-kinds';

type FinanceSubject =
  | 'payment'
  | 'payment_void'
  | 'billing_run'
  | 'adjustment'
  | 'student_discount'
  | 'fee_line'
  | 'term';

export interface FinanceActor {
  organizationId: string;
  userId: string;
  name: string;
  currency: string;
}

export interface CampusAmount {
  campusId: string;
  amountMinor: number;
}

interface CampusTotal extends CampusAmount {
  count: number;
}

export interface PaymentFacts {
  id: string;
  receiptNumber: string;
  payerName: string;
}

export interface AdjustmentFacts {
  id: string;
  number: string;
  kind: AdjustmentKind;
  amountMinor: number;
  studentId: string;
  studentName: string;
  campusId: string;
}

export interface DiscountFacts {
  id: string;
  kind: DiscountKind;
  value: number;
  studentId: string;
  studentName: string;
  campusId: string;
}

export const financeActor = (
  who: Omit<FinanceActor, 'currency'>,
  currency: string
): FinanceActor => ({ ...who, currency });

export const financeActorIn = async (
  ctx: { organizationId: string; user: { id: string; name: string } },
  tx: { currency(): Promise<string> }
): Promise<FinanceActor> =>
  financeActor(
    {
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      name: ctx.user.name,
    },
    await tx.currency()
  );

export const studentFacts = (
  student: StudentIdentity
): Pick<AdjustmentFacts, 'studentId' | 'studentName' | 'campusId'> => ({
  studentId: student.id,
  studentName: student.name,
  campusId: student.campusId,
});

interface RowFacts {
  campusId: string | null;
  kind: string;
  subject: { type: FinanceSubject; id: string };
  text: string;
  data: Record<string, unknown>;
}

const finance = (actor: FinanceActor, row: RowFacts): ActivityInput => ({
  organizationId: actor.organizationId,
  campusId: row.campusId,
  pillar: 'finance',
  kind: row.kind,
  actorUserId: actor.userId,
  subjectType: row.subject.type,
  subjectId: row.subject.id,
  text: row.text,
  data: row.data,
});

function sumByCampus(rows: readonly CampusAmount[]): CampusTotal[] {
  const totals = new Map<string, CampusTotal>();
  for (const row of rows) {
    const total = totals.get(row.campusId) ?? {
      campusId: row.campusId,
      amountMinor: 0,
      count: 0,
    };
    total.amountMinor += row.amountMinor;
    total.count += 1;
    totals.set(row.campusId, total);
  }
  return [...totals.values()];
}

const verdict = (autoApproved: boolean): string =>
  autoApproved ? 'applied' : 'approved';

export function roundSentActivity(
  actor: FinanceActor,
  round: { id: string; number: string },
  charges: readonly CampusAmount[]
): ActivityInput[] {
  return sumByCampus(charges).map(({ campusId, amountMinor, count }) =>
    finance(actor, {
      campusId,
      kind: 'round.sent',
      subject: { type: 'billing_run', id: round.id },
      text: `${actor.name} sent round ${round.number}: ${countOf(count, 'charge', 'charges')}, ${money(amountMinor, actor.currency)}.`,
      data: {
        runId: round.id,
        number: round.number,
        charges: count,
        totalMinor: amountMinor,
      },
    })
  );
}

export function paymentRecordedActivity(
  actor: FinanceActor,
  payment: PaymentFacts,
  allocations: readonly CampusAmount[]
): ActivityInput[] {
  const shares = sumByCampus(allocations);
  return shares.map(({ campusId, amountMinor }) =>
    finance(actor, {
      campusId,
      kind: 'payment.recorded',
      subject: { type: 'payment', id: payment.id },
      text:
        shares.length > 1
          ? `Payment ${payment.receiptNumber} from ${payment.payerName} recorded by ${actor.name}: ${money(amountMinor, actor.currency)} of it for this campus.`
          : `Payment ${payment.receiptNumber} of ${money(amountMinor, actor.currency)} from ${payment.payerName} recorded by ${actor.name}.`,
      data: {
        paymentId: payment.id,
        receiptNumber: payment.receiptNumber,
        amountMinor,
      },
    })
  );
}

export function paymentCancelledActivity(
  actor: FinanceActor,
  payment: PaymentFacts,
  cancellation: {
    allocations: readonly CampusAmount[];
    autoApproved: boolean;
  }
): ActivityInput[] {
  const closing = cancellation.autoApproved
    ? `cancelled by ${actor.name}`
    : `cancelled, approved by ${actor.name}`;
  const shares = sumByCampus(cancellation.allocations);
  return shares.map(({ campusId, amountMinor }) =>
    finance(actor, {
      campusId,
      kind: 'payment.cancelled',
      subject: { type: 'payment', id: payment.id },
      text:
        shares.length > 1
          ? `Payment ${payment.receiptNumber} from ${payment.payerName} (${money(amountMinor, actor.currency)} of it for this campus) was ${closing}.`
          : `Payment ${payment.receiptNumber} (${money(amountMinor, actor.currency)} from ${payment.payerName}) was ${closing}.`,
      data: {
        paymentId: payment.id,
        receiptNumber: payment.receiptNumber,
        amountMinor,
        autoApproved: cancellation.autoApproved,
      },
    })
  );
}

export function paymentCancellationDeclinedActivity(
  actor: FinanceActor,
  payment: PaymentFacts,
  declined: {
    voidId: string;
    reason: string;
    allocations: readonly CampusAmount[];
  }
): ActivityInput[] {
  return sumByCampus(declined.allocations).map(({ campusId, amountMinor }) =>
    finance(actor, {
      campusId,
      kind: 'payment_void.declined',
      subject: { type: 'payment_void', id: declined.voidId },
      text: `Cancelling payment ${payment.receiptNumber} was declined: ${declined.reason}`,
      data: {
        voidId: declined.voidId,
        paymentId: payment.id,
        receiptNumber: payment.receiptNumber,
        amountMinor,
      },
    })
  );
}

export function adjustmentApprovedActivity(
  actor: FinanceActor,
  adjustment: AdjustmentFacts,
  autoApproved: boolean
): ActivityInput[] {
  return [
    finance(actor, {
      campusId: adjustment.campusId,
      kind: 'adjustment.approved',
      subject: { type: 'adjustment', id: adjustment.id },
      text: `${ADJUSTMENT_KIND_LABELS[adjustment.kind]} ${adjustment.number} for ${adjustment.studentName}, ${money(adjustment.amountMinor, actor.currency)}, ${verdict(autoApproved)} by ${actor.name}.`,
      data: {
        adjustmentId: adjustment.id,
        number: adjustment.number,
        adjustmentKind: adjustment.kind,
        studentId: adjustment.studentId,
        amountMinor: adjustment.amountMinor,
        autoApproved,
      },
    }),
  ];
}

export function adjustmentDeclinedActivity(
  actor: FinanceActor,
  adjustment: AdjustmentFacts,
  reason: string
): ActivityInput[] {
  return [
    finance(actor, {
      campusId: adjustment.campusId,
      kind: 'adjustment.declined',
      subject: { type: 'adjustment', id: adjustment.id },
      text: `${ADJUSTMENT_KIND_LABELS[adjustment.kind]} ${adjustment.number} for ${adjustment.studentName} was declined: ${reason}`,
      data: {
        adjustmentId: adjustment.id,
        number: adjustment.number,
        adjustmentKind: adjustment.kind,
        studentId: adjustment.studentId,
        amountMinor: adjustment.amountMinor,
      },
    }),
  ];
}

const discountValue = (actor: FinanceActor, discount: DiscountFacts): string =>
  discount.kind === 'percent'
    ? `${discount.value}%`
    : money(discount.value, actor.currency);

export function discountApprovedActivity(
  actor: FinanceActor,
  discount: DiscountFacts,
  autoApproved: boolean
): ActivityInput[] {
  return [
    finance(actor, {
      campusId: discount.campusId,
      kind: 'discount.approved',
      subject: { type: 'student_discount', id: discount.id },
      text: `Discount for ${discount.studentName} (${discountValue(actor, discount)}) ${verdict(autoApproved)} by ${actor.name}.`,
      data: {
        discountId: discount.id,
        studentId: discount.studentId,
        discountKind: discount.kind,
        value: discount.value,
        autoApproved,
      },
    }),
  ];
}

export function discountDeclinedActivity(
  actor: FinanceActor,
  discount: DiscountFacts,
  reason: string
): ActivityInput[] {
  return [
    finance(actor, {
      campusId: discount.campusId,
      kind: 'discount.declined',
      subject: { type: 'student_discount', id: discount.id },
      text: `Discount for ${discount.studentName} was declined: ${reason}`,
      data: {
        discountId: discount.id,
        studentId: discount.studentId,
        discountKind: discount.kind,
        value: discount.value,
      },
    }),
  ];
}

interface CopiedTerm {
  id: string;
  label: string;
}

const lineRow = (
  actor: FinanceActor,
  line: FeeLine,
  row: Pick<RowFacts, 'kind' | 'text' | 'data'>
): ActivityInput[] => [
  finance(actor, {
    ...row,
    campusId: line.campusId,
    subject: { type: 'fee_line', id: line.id },
    data: { feeLineId: line.id, termId: line.termId, ...row.data },
  }),
];

const lineWhere = (line: FeeLine, termLabel: string): string =>
  `for ${line.levelName}, ${line.campusName ?? 'every campus'}, ${termLabel}`;

export const feeLineCreatedActivity = (
  actor: FinanceActor,
  line: FeeLine,
  termLabel: string
): ActivityInput[] =>
  lineRow(actor, line, {
    kind: FEE_SCHEDULE_KINDS.created,
    text: `${actor.name} added ${line.name} (${line.feeTypeName}) ${lineWhere(line, termLabel)}: ${money(line.amountMinor, actor.currency)}.`,
    data: {
      classLevelId: line.classLevelId,
      feeTypeId: line.feeTypeId,
      amountMinor: line.amountMinor,
      appliesTo: line.appliesTo,
      isOptional: line.isOptional,
    },
  });

export const feeLineAmountChangedActivity = (
  actor: FinanceActor,
  line: FeeLine,
  change: { previousAmountMinor: number; termLabel: string }
): ActivityInput[] =>
  lineRow(actor, line, {
    kind: FEE_SCHEDULE_KINDS.amountChanged,
    text: `${actor.name} changed ${line.name} ${lineWhere(line, change.termLabel)} from ${money(change.previousAmountMinor, actor.currency)} to ${money(line.amountMinor, actor.currency)}.`,
    data: {
      previousAmountMinor: change.previousAmountMinor,
      amountMinor: line.amountMinor,
    },
  });

export const feeLineRetiredActivity = (
  actor: FinanceActor,
  line: FeeLine,
  termLabel: string
): ActivityInput[] =>
  lineRow(actor, line, {
    kind: FEE_SCHEDULE_KINDS.retired,
    text: `${actor.name} retired ${line.name} ${lineWhere(line, termLabel)} (${money(line.amountMinor, actor.currency)}).`,
    data: { amountMinor: line.amountMinor },
  });

export interface CopiedShare {
  campusId: string | null;
  count: number;
}

const copyShare = (campusId: string | null, split: boolean): string => {
  if (!split) {
    return '';
  }
  return campusId === null ? ' (for every campus)' : ' (for this campus)';
};

export function feeLinesCopiedActivity(
  actor: FinanceActor,
  terms: { from: CopiedTerm; to: CopiedTerm },
  copied: readonly CopiedShare[]
): ActivityInput[] {
  return copied.map(({ campusId, count }) =>
    finance(actor, {
      campusId,
      kind: FEE_SCHEDULE_KINDS.copied,
      subject: { type: 'term', id: terms.to.id },
      text: `${actor.name} copied ${countOf(count, 'fee line', 'fee lines')} from ${terms.from.label} to ${terms.to.label}${copyShare(campusId, copied.length > 1)}.`,
      data: { fromTermId: terms.from.id, toTermId: terms.to.id, copied: count },
    })
  );
}
