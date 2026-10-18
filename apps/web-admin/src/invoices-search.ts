import {
  INVOICE_KINDS,
  INVOICE_STATUSES,
  type InvoiceKind,
  type InvoiceStatus,
} from '@eduvault/api-contract';
import { oneOf, pageOf, textOf } from '@eduvault/shared';

export interface InvoicesSearch {
  q?: string;
  kind?: InvoiceKind;
  status?: InvoiceStatus;
  page?: number;
  new?: 1;
}

export function parseInvoicesSearch(
  search: Record<string, unknown>
): InvoicesSearch {
  return {
    q: textOf(search['q']),
    kind: oneOf(INVOICE_KINDS, search['kind']),
    status: oneOf(INVOICE_STATUSES, search['status']),
    page: pageOf(search['page']),
    new: textOf(search['new']) === '1' ? 1 : undefined,
  };
}
