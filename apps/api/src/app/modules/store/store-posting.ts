import type { PostInput } from '../../common/ledger';

interface PostedDelivery {
  organizationId: string;
  number: string;
  deliveryId: string;
  campusId: string;
  receivedOn: string;
  postedBy: string;
  storeStockId: string;
  totalMinor: number;
}

interface DeliveryPostingInput extends PostedDelivery {
  supplierName: string;
  moneyLedgerAccountId: string;
}

interface OpeningStockPostingInput extends PostedDelivery {
  storeName: string;
  openingBalanceId: string;
}

const entry = (
  input: PostedDelivery,
  creditAccountId: string
): Omit<PostInput, 'kind' | 'memo'> => ({
  organizationId: input.organizationId,
  reference: input.number,
  effectiveOn: input.receivedOn,
  postedBy: input.postedBy,
  sourceId: input.deliveryId,
  lines: [
    {
      ledgerAccountId: input.storeStockId,
      campusId: input.campusId,
      debitMinor: input.totalMinor,
      creditMinor: 0,
    },
    {
      ledgerAccountId: creditAccountId,
      campusId: input.campusId,
      debitMinor: 0,
      creditMinor: input.totalMinor,
    },
  ],
});

export const deliveryPosting = (input: DeliveryPostingInput): PostInput => ({
  ...entry(input, input.moneyLedgerAccountId),
  kind: 'store_receive',
  memo: `Delivery ${input.number} · ${input.supplierName}`,
});

export const openingStockPosting = (
  input: OpeningStockPostingInput
): PostInput => ({
  ...entry(input, input.openingBalanceId),
  kind: 'opening',
  memo: `Opening stock · ${input.storeName}`,
});
