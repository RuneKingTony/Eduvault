import type {
  Invoice,
  InvoiceCounts,
  InvoiceListQuery,
  InvoiceListSummary,
  InvoiceSummary,
} from '@eduvault/api-contract';
import type { ReceivableMovement } from '../../common/ledger';
import type { OrgScope } from '../../common/scope';

export interface InvoicePage {
  items: InvoiceSummary[];
  total: number;
}

export type InvoiceRecord = Omit<
  Invoice,
  'currency' | 'broughtForwardMinor' | 'dueAtIssueMinor' | 'balanceTodayMinor'
> & {
  entrySequence: number | null;
};

export abstract class InvoiceRepository {
  abstract currency(organizationId: string): Promise<string>;

  abstract studentVisible(scope: OrgScope, studentId: string): Promise<boolean>;

  abstract list(scope: OrgScope, query: InvoiceListQuery): Promise<InvoicePage>;

  abstract counts(scope: OrgScope): Promise<InvoiceCounts>;

  abstract summary(scope: OrgScope): Promise<InvoiceListSummary>;

  abstract termTotals(
    scope: OrgScope,
    termId: string
  ): Promise<{ count: number; totalMinor: number }>;

  abstract find(
    scope: OrgScope,
    id: string
  ): Promise<InvoiceRecord | undefined>;

  abstract movements(
    organizationId: string,
    studentId: string
  ): Promise<ReceivableMovement[]>;
}
