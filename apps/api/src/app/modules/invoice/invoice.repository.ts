import type {
  Invoice,
  InvoiceCounts,
  InvoiceListQuery,
  InvoiceListSummary,
  InvoiceSummary,
} from '@eduvault/api-contract';
import type { CampusScope } from '../../common/campus-scope';
import type { ReceivableMovement } from '../../common/ledger';

export interface InvoiceScope {
  organizationId: string;
  campusScope: CampusScope;
}

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

  abstract studentVisible(
    scope: InvoiceScope,
    studentId: string
  ): Promise<boolean>;

  abstract list(
    scope: InvoiceScope,
    query: InvoiceListQuery
  ): Promise<InvoicePage>;

  abstract counts(scope: InvoiceScope): Promise<InvoiceCounts>;

  abstract summary(scope: InvoiceScope): Promise<InvoiceListSummary>;

  abstract termTotals(
    scope: InvoiceScope,
    termId: string
  ): Promise<{ count: number; totalMinor: number }>;

  abstract find(
    scope: InvoiceScope,
    id: string
  ): Promise<InvoiceRecord | undefined>;

  abstract movements(
    organizationId: string,
    studentId: string
  ): Promise<ReceivableMovement[]>;
}
