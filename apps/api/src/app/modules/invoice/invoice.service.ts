import { Injectable, NotFoundException } from '@nestjs/common';
import {
  INVOICE_NOT_FOUND_MESSAGE,
  INVOICE_STUDENT_NOT_FOUND_MESSAGE,
  type Invoice,
  type InvoiceList,
  type InvoiceListQuery,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { balanceToday, broughtForward } from '../../common/ledger';
import { InvoiceRepository, type InvoiceScope } from './invoice.repository';

const scopeOf = (ctx: OrgContext): InvoiceScope => ({
  organizationId: ctx.organizationId,
  campusScope: ctx.campusScope,
});

@Injectable()
export class InvoiceService {
  constructor(private readonly invoices: InvoiceRepository) {}

  async listPage(
    ctx: OrgContext,
    query: InvoiceListQuery
  ): Promise<Omit<InvoiceList, 'counts' | 'summary'>> {
    const scope = scopeOf(ctx);
    if (
      query.studentId !== undefined &&
      !(await this.invoices.studentVisible(scope, query.studentId))
    ) {
      throw new NotFoundException(INVOICE_STUDENT_NOT_FOUND_MESSAGE);
    }
    const [currency, page] = await Promise.all([
      this.invoices.currency(ctx.organizationId),
      this.invoices.list(scope, query),
    ]);
    return { currency, ...page };
  }

  async list(ctx: OrgContext, query: InvoiceListQuery): Promise<InvoiceList> {
    const scope = scopeOf(ctx);
    const [page, counts, summary] = await Promise.all([
      this.listPage(ctx, query),
      this.invoices.counts(scope),
      this.invoices.summary(scope),
    ]);
    return { ...page, counts, summary };
  }

  async chargedIn(
    ctx: OrgContext,
    termId: string
  ): Promise<{ currency: string; count: number; totalMinor: number }> {
    const [currency, totals] = await Promise.all([
      this.invoices.currency(ctx.organizationId),
      this.invoices.termTotals(scopeOf(ctx), termId),
    ]);
    return { currency, ...totals };
  }

  async get(ctx: OrgContext, id: string): Promise<Invoice> {
    const record = await this.invoices.find(scopeOf(ctx), id);
    if (record === undefined) {
      throw new NotFoundException(INVOICE_NOT_FOUND_MESSAGE);
    }
    const [currency, movements] = await Promise.all([
      this.invoices.currency(ctx.organizationId),
      this.invoices.movements(ctx.organizationId, record.student.id),
    ]);
    const { entrySequence, ...invoice } = record;
    const today = balanceToday(movements);
    const before =
      entrySequence === null ? today : broughtForward(movements, entrySequence);
    return {
      ...invoice,
      currency,
      broughtForwardMinor: before,
      dueAtIssueMinor: before + record.totalMinor,
      balanceTodayMinor: today,
    };
  }
}
