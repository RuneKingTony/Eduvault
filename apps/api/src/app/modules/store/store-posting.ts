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

interface CountPostingInput {
  organizationId: string;
  number: string;
  countId: string;
  campusId: string;
  effectiveOn: string;
  postedBy: string;
  storeStockId: string;
  storeLossesId: string;
  /** Shortage value minus surplus value: positive is a loss, negative a gain. */
  netMinor: number;
}

export function countPosting(input: CountPostingInput): PostInput | undefined {
  if (input.netMinor === 0) {
    return undefined;
  }
  const amountMinor = Math.abs(input.netMinor);
  const line = (
    ledgerAccountId: string,
    side: 'debit' | 'credit'
  ): PostInput['lines'][number] => ({
    ledgerAccountId,
    campusId: input.campusId,
    debitMinor: side === 'debit' ? amountMinor : 0,
    creditMinor: side === 'credit' ? amountMinor : 0,
  });
  const loss = input.netMinor > 0;
  return {
    organizationId: input.organizationId,
    reference: input.number,
    kind: 'store_count',
    effectiveOn: input.effectiveOn,
    postedBy: input.postedBy,
    sourceId: input.countId,
    memo: `Stock count ${input.number}`,
    lines: [
      line(loss ? input.storeLossesId : input.storeStockId, 'debit'),
      line(loss ? input.storeStockId : input.storeLossesId, 'credit'),
    ],
  };
}
