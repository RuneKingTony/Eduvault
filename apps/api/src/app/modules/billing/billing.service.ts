import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BILLING_ALREADY_SENT_MESSAGE,
  BILLING_CANCELLED_MESSAGE,
  BILLING_ONLY_DRAFTS_MESSAGE,
  BILLING_OUT_OF_SCOPE_MESSAGE,
  BILLING_RUN_NOT_FOUND_MESSAGE,
  type BillingRun,
  type BillingRunList,
  type BillingRunListQuery,
  type BillingTerm,
  type PrepareBody,
  type PrepareResult,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { InvoiceService } from '../invoice/invoice.service';
import { settleCounts } from './billing-round';
import { BillingPlanService } from './billing-plan.service';
import { scopeOf } from './billing-scope';
import {
  BillingRunRepository,
  type RunOutcome,
} from './billing-run.repository';

const FIRST_PAGE: BillingRunListQuery = { page: 1, pageSize: 10 };

function assertDone(
  outcome: RunOutcome,
  conflicts: { sent: string; cancelled: string }
): void {
  switch (outcome.status) {
    case 'done': {
      return;
    }
    case 'not_found': {
      throw new NotFoundException(BILLING_RUN_NOT_FOUND_MESSAGE);
    }
    case 'out_of_scope': {
      throw new ForbiddenException(BILLING_OUT_OF_SCOPE_MESSAGE);
    }
    case 'refused': {
      throw new ConflictException(
        outcome.current === 'cancelled' ? conflicts.cancelled : conflicts.sent
      );
    }
  }
}

@Injectable()
export class BillingService {
  constructor(
    private readonly runs: BillingRunRepository,
    private readonly plans: BillingPlanService,
    private readonly invoices: InvoiceService
  ) {}

  async list(
    ctx: OrgContext,
    query: BillingRunListQuery
  ): Promise<BillingRunList> {
    const [currency, page] = await Promise.all([
      this.runs.currency(ctx.organizationId),
      this.runs.listRuns(scopeOf(ctx), query),
    ]);
    return { currency, ...page };
  }

  terms(ctx: OrgContext): Promise<BillingTerm[]> {
    return this.plans.terms(ctx);
  }

  async get(
    ctx: OrgContext,
    id: string,
    query: BillingRunListQuery = FIRST_PAGE
  ): Promise<BillingRun> {
    const header = await this.runs.findRun(scopeOf(ctx), id);
    if (header === undefined) {
      throw new NotFoundException(BILLING_RUN_NOT_FOUND_MESSAGE);
    }
    const page = await this.invoices.listPage(ctx, {
      billingRunId: id,
      page: query.page,
      pageSize: query.pageSize,
    });
    return { ...header, currency: page.currency, charges: page.items };
  }

  async prepare(ctx: OrgContext, body: PrepareBody): Promise<PrepareResult> {
    const term = await this.plans.chargeableTerm(ctx, body.termId);
    const filter = await this.plans.filterOf(ctx, body);
    const plan = await this.plans.plan(ctx, term, filter);
    if (plan.charges.length === 0) {
      return {
        runId: null,
        number: null,
        created: 0,
        skipped: plan.counts.skipped,
        none: plan.counts.none,
        termId: term.id,
      };
    }
    const round = await this.runs.createRound({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      termId: term.id,
      filter,
      year: this.plans.stamp(ctx).year,
      charges: plan.charges,
    });
    const counts = settleCounts(plan.counts, round.created);
    return {
      runId: round.runId,
      number: round.number,
      created: counts.created,
      skipped: counts.skipped,
      none: counts.none,
      termId: term.id,
    };
  }

  async issue(ctx: OrgContext, id: string): Promise<BillingRun> {
    const outcome = await this.runs.issue({
      scope: scopeOf(ctx),
      runId: id,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ...this.plans.stamp(ctx),
    });
    assertDone(outcome, {
      sent: BILLING_ALREADY_SENT_MESSAGE,
      cancelled: BILLING_CANCELLED_MESSAGE,
    });
    return this.get(ctx, id);
  }

  async cancel(ctx: OrgContext, id: string): Promise<BillingRun> {
    const outcome = await this.runs.cancel({
      scope: scopeOf(ctx),
      runId: id,
      userId: ctx.user.id,
      userName: ctx.user.name,
    });
    assertDone(outcome, {
      sent: BILLING_ONLY_DRAFTS_MESSAGE,
      cancelled: BILLING_ONLY_DRAFTS_MESSAGE,
    });
    return this.get(ctx, id);
  }
}
