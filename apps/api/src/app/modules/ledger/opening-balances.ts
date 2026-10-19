import type {
  OpeningMoneyAccountItem,
  OpeningStudentItem,
} from '@eduvault/api-contract';
import { SYSTEM_REFERENCE_PREFIXES } from '@eduvault/shared';
import type { LedgerLine } from '../../common/ledger';

export const OPENING_MEMO = 'Opening balance';

export interface PlannedEntry {
  reference: string;
  effectiveOn: string;
  memo: string;
  lines: LedgerLine[];
  subject: { studentId: string } | { moneyAccountId: string };
}

interface StudentTarget {
  campusId: string;
  receivableId: string;
  equityId: string;
}

interface MoneyAccountTarget {
  campusId: string | null;
  ledgerAccountId: string;
  equityId: string;
}

/** A debt is owed to the school (Dr fees owed); a credit is held for the family (Cr fees owed). */
export function planStudentEntry(
  item: OpeningStudentItem,
  target: StudentTarget
): PlannedEntry {
  const owed = item.direction === 'debt';
  const amount = item.amountMinor;
  const fees: LedgerLine = {
    ledgerAccountId: target.receivableId,
    studentId: item.studentId,
    campusId: target.campusId,
    debitMinor: owed ? amount : 0,
    creditMinor: owed ? 0 : amount,
  };
  const equity: LedgerLine = {
    ledgerAccountId: target.equityId,
    campusId: target.campusId,
    debitMinor: owed ? 0 : amount,
    creditMinor: owed ? amount : 0,
  };
  return {
    reference: `${SYSTEM_REFERENCE_PREFIXES.opening}-${item.studentId}`,
    effectiveOn: item.effectiveOn,
    memo: item.memo ?? OPENING_MEMO,
    lines: [fees, equity],
    subject: { studentId: item.studentId },
  };
}

export function planMoneyAccountEntry(
  item: OpeningMoneyAccountItem,
  target: MoneyAccountTarget
): PlannedEntry {
  const amount = item.amountMinor;
  return {
    reference: `${SYSTEM_REFERENCE_PREFIXES.opening}-MA-${item.moneyAccountId}`,
    effectiveOn: item.effectiveOn,
    memo: OPENING_MEMO,
    lines: [
      {
        ledgerAccountId: target.ledgerAccountId,
        campusId: target.campusId,
        debitMinor: amount,
        creditMinor: 0,
      },
      {
        ledgerAccountId: target.equityId,
        campusId: target.campusId,
        debitMinor: 0,
        creditMinor: amount,
      },
    ],
    subject: { moneyAccountId: item.moneyAccountId },
  };
}
