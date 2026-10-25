import {
  ADJUSTMENT_KIND_LABELS,
  type AdjustmentKind,
} from '@eduvault/api-contract';
import { clampMemo, type LedgerLine } from '../../common/ledger';

export interface PostingFacts {
  kind: AdjustmentKind;
  amountMinor: number;
  studentId: string;
  studentCampusId: string | null;
  receivableId: string;
  badDebtId: string;
  creditNoteAccountId: string | null;
  money: { ledgerAccountId: string; campusId: string | null } | null;
}

export const adjustmentMemo = (kind: AdjustmentKind, reason: string): string =>
  clampMemo(`${ADJUSTMENT_KIND_LABELS[kind]}: ${reason}`);

function studentLine(
  facts: PostingFacts,
  side: 'debit' | 'credit'
): LedgerLine {
  return {
    ledgerAccountId: facts.receivableId,
    studentId: facts.studentId,
    campusId: facts.studentCampusId,
    debitMinor: side === 'debit' ? facts.amountMinor : 0,
    creditMinor: side === 'credit' ? facts.amountMinor : 0,
  };
}

function expenseLine(facts: PostingFacts, accountId: string): LedgerLine {
  return {
    ledgerAccountId: accountId,
    campusId: facts.studentCampusId,
    debitMinor: facts.amountMinor,
    creditMinor: 0,
  };
}

export function adjustmentLines(facts: PostingFacts): LedgerLine[] {
  switch (facts.kind) {
    case 'credit_note': {
      if (facts.creditNoteAccountId === null) {
        throw new Error('A fee reduction needs the account it debits.');
      }
      return [
        expenseLine(facts, facts.creditNoteAccountId),
        studentLine(facts, 'credit'),
      ];
    }
    case 'write_off': {
      return [
        expenseLine(facts, facts.badDebtId),
        studentLine(facts, 'credit'),
      ];
    }
    case 'refund': {
      if (facts.money === null) {
        throw new Error('A refund needs the money account it pays from.');
      }
      return [
        studentLine(facts, 'debit'),
        {
          ledgerAccountId: facts.money.ledgerAccountId,
          campusId: facts.money.campusId,
          debitMinor: 0,
          creditMinor: facts.amountMinor,
        },
      ];
    }
  }
}
