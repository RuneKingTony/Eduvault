import type { LedgerLine } from '../../common/ledger';

interface TopUpPosting {
  moneyLedgerAccountId: string;
  moneyCampusId: string | null;
  walletsAccountId: string;
  familyId: string;
  amountMinor: number;
}

export function topUpPostingLines(input: TopUpPosting): LedgerLine[] {
  return [
    {
      ledgerAccountId: input.moneyLedgerAccountId,
      campusId: input.moneyCampusId,
      debitMinor: input.amountMinor,
      creditMinor: 0,
    },
    {
      ledgerAccountId: input.walletsAccountId,
      familyId: input.familyId,
      debitMinor: 0,
      creditMinor: input.amountMinor,
    },
  ];
}

interface SpendPosting {
  walletsAccountId: string;
  receivableId: string;
  familyId: string;
  lines: readonly { studentId: string; amountMinor: number }[];
  campusOf: ReadonlyMap<string, string>;
}

/** One Dr 2200 and one Cr 1100 per child, so each child's statement and the family's wallet both show the line. */
export function spendPostingLines(input: SpendPosting): LedgerLine[] {
  return input.lines.flatMap((line) => [
    {
      ledgerAccountId: input.walletsAccountId,
      familyId: input.familyId,
      studentId: line.studentId,
      debitMinor: line.amountMinor,
      creditMinor: 0,
    },
    {
      ledgerAccountId: input.receivableId,
      studentId: line.studentId,
      campusId: input.campusOf.get(line.studentId) ?? null,
      debitMinor: 0,
      creditMinor: line.amountMinor,
    },
  ]);
}
