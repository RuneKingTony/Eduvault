import { PAYMENT_STATUSES, type PaymentStatus } from '@eduvault/api-contract';
import { oneOf, pageOf, textOf } from '@eduvault/shared';

export interface PaymentsSearch {
  q?: string;
  status?: PaymentStatus;
  page?: number;
  record?: 1;
}

export function parsePaymentsSearch(
  search: Record<string, unknown>
): PaymentsSearch {
  return {
    q: textOf(search['q']),
    status: oneOf(PAYMENT_STATUSES, search['status']),
    page: pageOf(search['page']),
    record: textOf(search['record']) === '1' ? 1 : undefined,
  };
}

interface ReceiptSearch {
  recorded?: 1;
}

export const parseReceiptSearch = (
  search: Record<string, unknown>
): ReceiptSearch => ({
  recorded: textOf(search['recorded']) === '1' ? 1 : undefined,
});
