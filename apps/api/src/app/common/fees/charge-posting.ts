import type { LedgerLine } from '../ledger';
import type { ChargeLine } from './charge-lines';

interface ChargePosting {
  lines: readonly Pick<ChargeLine, 'ledgerAccountId' | 'amountMinor'>[];
  receivableId: string;
  studentId: string;
  campusId: string;
}

/** Not netted, so discount lines stay visible in the journal. */
export function chargePostingLines(posting: ChargePosting): LedgerLine[] {
  const { receivableId, studentId, campusId } = posting;
  return posting.lines.flatMap((line) => {
    const amount = Math.abs(line.amountMinor);
    const owed = { ledgerAccountId: receivableId, studentId, campusId };
    const other = { ledgerAccountId: line.ledgerAccountId, campusId };
    return line.amountMinor > 0
      ? [
          { ...owed, debitMinor: amount, creditMinor: 0 },
          { ...other, debitMinor: 0, creditMinor: amount },
        ]
      : [
          { ...other, debitMinor: amount, creditMinor: 0 },
          { ...owed, debitMinor: 0, creditMinor: amount },
        ];
  });
}
