import type { PostInput } from '../../common/ledger';

interface SaleEntries {
  organizationId: string;
  invoiceId: string;
  chargeNumber: string;
  effectiveOn: string;
  postedBy: string;
  campusId: string;
}

interface CostPostingInput extends SaleEntries {
  costExpenseId: string;
  storeStockId: string;
  costMinor: number;
}

export const saleLineDescription = (
  displayName: string,
  quantity: number
): string => `${displayName} × ${quantity}`;

export const saleCostReference = (chargeNumber: string): string =>
  `${chargeNumber}-COST`;

export const saleChargeMemo = (studentName: string): string =>
  `Store purchase · ${studentName}`;

export const saleCostPosting = (
  input: CostPostingInput
): PostInput | undefined =>
  input.costMinor === 0
    ? undefined
    : {
        organizationId: input.organizationId,
        reference: saleCostReference(input.chargeNumber),
        kind: 'store_cost',
        effectiveOn: input.effectiveOn,
        memo: `Cost of store items · ${input.chargeNumber}`,
        postedBy: input.postedBy,
        sourceId: input.invoiceId,
        lines: [
          {
            ledgerAccountId: input.costExpenseId,
            campusId: input.campusId,
            debitMinor: input.costMinor,
            creditMinor: 0,
          },
          {
            ledgerAccountId: input.storeStockId,
            campusId: input.campusId,
            debitMinor: 0,
            creditMinor: input.costMinor,
          },
        ],
      };
