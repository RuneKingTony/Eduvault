import { Injectable } from '@nestjs/common';
import {
  DASHBOARD_SAMPLE_SIZE,
  type DashboardTask,
} from '@eduvault/api-contract';
import { can } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import { BillingPlanService } from '../billing/billing-plan.service';
import { BillingService } from '../billing/billing.service';
import type { DashboardTaskSource } from './dashboard-task-source';

const MAX_UNSENT_ROUNDS = 20;

@Injectable()
export class DashboardChargesService implements DashboardTaskSource {
  constructor(
    private readonly plans: BillingPlanService,
    private readonly billing: BillingService
  ) {}

  async tasks(ctx: OrgContext): Promise<DashboardTask[]> {
    if (!can(ctx.permissions, 'invoice', 'bill')) {
      return [];
    }
    const term = await this.plans.currentTerm(ctx);
    if (term === undefined) {
      return [];
    }
    const [drafts, summary] = await Promise.all([
      this.billing.list(ctx, {
        status: 'draft',
        page: 1,
        pageSize: MAX_UNSENT_ROUNDS,
      }),
      this.plans.summary(ctx, term, DASHBOARD_SAMPLE_SIZE),
    ]);
    const unsent = drafts.items.map((run): DashboardTask => ({
      kind: 'unsentRound',
      runId: run.id,
      number: run.number,
      termName: run.termName,
      count: run.chargeCount,
    }));
    return summary.created === 0
      ? unsent
      : [
          ...unsent,
          {
            kind: 'notCharged',
            count: summary.created,
            termId: term.id,
            termName: term.name,
            students: summary.sample,
          },
        ];
  }
}
