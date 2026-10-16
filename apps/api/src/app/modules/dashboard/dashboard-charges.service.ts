import { Injectable } from '@nestjs/common';
import {
  DASHBOARD_SAMPLE_SIZE,
  type DashboardCharged,
  type DashboardTask,
} from '@eduvault/api-contract';
import { can } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import { BillingPlanService } from '../billing/billing-plan.service';
import { BillingService } from '../billing/billing.service';
import { InvoiceService } from '../invoice/invoice.service';

const MAX_UNSENT_ROUNDS = 20;

@Injectable()
export class DashboardChargesService {
  constructor(
    private readonly plans: BillingPlanService,
    private readonly billing: BillingService,
    private readonly invoices: InvoiceService
  ) {}

  async tasks(ctx: OrgContext): Promise<DashboardTask[]> {
    if (!can(ctx.permissions, 'invoice', 'bill')) {
      return [];
    }
    const term = await this.plans.currentTerm(ctx);
    if (term === undefined) {
      return [];
    }
    const [drafts, plan] = await Promise.all([
      this.billing.list(ctx, {
        status: 'draft',
        page: 1,
        pageSize: MAX_UNSENT_ROUNDS,
      }),
      this.plans.plan(ctx, term, { scope: 'school' }),
    ]);
    const unsent = drafts.items.map((run): DashboardTask => ({
      kind: 'unsentRound',
      runId: run.id,
      number: run.number,
      termName: run.termName,
      count: run.chargeCount,
    }));
    const students = plan.charges
      .map((charge) => ({ id: charge.studentId, name: charge.name }))
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .slice(0, DASHBOARD_SAMPLE_SIZE);
    return plan.counts.created === 0
      ? unsent
      : [
          ...unsent,
          {
            kind: 'notCharged',
            count: plan.counts.created,
            termId: term.id,
            termName: term.name,
            students,
          },
        ];
  }

  async charged(ctx: OrgContext): Promise<DashboardCharged | null> {
    const term = await this.plans.currentTerm(ctx);
    if (term === undefined) {
      return null;
    }
    const totals = await this.invoices.chargedIn(ctx, term.id);
    return {
      currency: totals.currency,
      termId: term.id,
      termName: `${term.name}, ${term.schoolYearName}`,
      chargedMinor: totals.totalMinor,
      chargeCount: totals.count,
    };
  }
}
