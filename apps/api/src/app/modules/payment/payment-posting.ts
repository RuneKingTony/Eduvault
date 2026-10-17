import type { LedgerLine } from '../../common/ledger';

interface PostingInput {
  moneyLedgerAccountId: string;
  moneyCampusId: string | null;
  receivableId: string;
  allocations: readonly { studentId: string; amountMinor: number }[];
  campusOf: ReadonlyMap<string, string>;
}

export function paymentPostingLines(input: PostingInput): LedgerLine[] {
  const received = input.allocations.reduce(
    (total, row) => total + row.amountMinor,
    0
  );
  return [
    {
      ledgerAccountId: input.moneyLedgerAccountId,
      campusId: input.moneyCampusId,
      debitMinor: received,
      creditMinor: 0,
    },
    ...input.allocations.map((row) => ({
      ledgerAccountId: input.receivableId,
      studentId: row.studentId,
      campusId: input.campusOf.get(row.studentId) ?? null,
      debitMinor: 0,
      creditMinor: row.amountMinor,
    })),
  ];
}
