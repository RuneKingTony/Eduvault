import { sumMinor, type LedgerLine } from '../ledger';

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

interface RefundPosting {
  moneyLedgerAccountId: string;
  moneyCampusId: string | null;
  walletsAccountId: string;
  familyId: string;
  amountMinor: number;
}

export function refundPostingLines(input: RefundPosting): LedgerLine[] {
  return [
    {
      ledgerAccountId: input.walletsAccountId,
      familyId: input.familyId,
      debitMinor: input.amountMinor,
      creditMinor: 0,
    },
    {
      ledgerAccountId: input.moneyLedgerAccountId,
      campusId: input.moneyCampusId,
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

interface CreditMigrationPosting {
  walletsAccountId: string;
  receivableId: string;
  familyId: string;
  children: readonly {
    studentId: string;
    campusId: string | null;
    amountMinor: number;
  }[];
}

export function creditMigrationPostingLines(
  input: CreditMigrationPosting
): LedgerLine[] {
  const totalMinor = sumMinor(input.children.map((child) => child.amountMinor));
  return [
    ...input.children.map((child) => ({
      ledgerAccountId: input.receivableId,
      studentId: child.studentId,
      campusId: child.campusId,
      debitMinor: child.amountMinor,
      creditMinor: 0,
    })),
    {
      ledgerAccountId: input.walletsAccountId,
      familyId: input.familyId,
      debitMinor: 0,
      creditMinor: totalMinor,
    },
  ];
}
