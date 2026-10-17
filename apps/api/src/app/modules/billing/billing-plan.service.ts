import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BILLING_CAMPUS_REQUIRED_MESSAGE,
  BILLING_LEVEL_REQUIRED_MESSAGE,
  BILLING_TERM_MESSAGE,
  FEE_LEVEL_NOT_FOUND_MESSAGE,
  FEE_TERM_NOT_FOUND_MESSAGE,
  type BillingTerm,
  type PrepareBody,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock, schoolToday } from '../../common/clock';
import { documentYear } from '../../common/documents';
import { CampusService } from '../campus/campus.service';
import {
  chargedState,
  defaultTermId,
  type RoundFilter,
} from './billing-inclusion';
import { scopeOf } from './billing-scope';
import {
  BillingRepository,
  type ChargeSummary,
  type TermInfo,
} from './billing.repository';
import { includedCandidates, planRound, type RoundPlan } from './round-plan';

const NO_SAMPLE = 0;

@Injectable()
export class BillingPlanService {
  constructor(
    private readonly billing: BillingRepository,
    private readonly campuses: CampusService,
    private readonly clock: Clock
  ) {}

  stamp(ctx: OrgContext): { today: string; year: number } {
    return {
      today: schoolToday(ctx, this.clock),
      year: documentYear(this.clock),
    };
  }

  summary(
    ctx: OrgContext,
    term: TermInfo,
    sampleSize: number
  ): Promise<ChargeSummary> {
    return this.billing.chargeSummary(scopeOf(ctx), term, {
      today: schoolToday(ctx, this.clock),
      sampleSize,
    });
  }

  async terms(ctx: OrgContext): Promise<BillingTerm[]> {
    const offered = await this.billing.termsToCharge(ctx.organizationId);
    const charged = await Promise.all(
      offered.map(async (term) => {
        const summary = await this.summary(ctx, term, NO_SAMPLE);
        return {
          term,
          state: chargedState(summary),
          levelIds: summary.levelIds,
        };
      })
    );
    const preferred = defaultTermId(
      charged.map(({ term, state }) => ({ termId: term.id, charged: state }))
    );
    return charged.map(({ term, state, levelIds }) => ({
      termId: term.id,
      name: term.name,
      schoolYearName: term.schoolYearName,
      charged: state,
      isDefault: term.id === preferred,
      levelIds,
    }));
  }

  async currentTerm(ctx: OrgContext): Promise<TermInfo | undefined> {
    const offered = await this.billing.termsToCharge(ctx.organizationId);
    return offered.find((term) => term.isCurrent);
  }

  async chargeableTerm(ctx: OrgContext, termId: string): Promise<TermInfo> {
    const term = await this.billing.findTerm(ctx.organizationId, termId);
    if (term === undefined) {
      throw new NotFoundException(FEE_TERM_NOT_FOUND_MESSAGE);
    }
    const offered = await this.billing.termsToCharge(ctx.organizationId);
    if (!offered.some((candidate) => candidate.id === term.id)) {
      throw new BadRequestException(BILLING_TERM_MESSAGE);
    }
    return term;
  }

  async filterOf(ctx: OrgContext, body: PrepareBody): Promise<RoundFilter> {
    if (body.scope === 'school') {
      return { scope: 'school' };
    }
    if (body.scopeId === undefined) {
      throw new BadRequestException(
        body.scope === 'campus'
          ? BILLING_CAMPUS_REQUIRED_MESSAGE
          : BILLING_LEVEL_REQUIRED_MESSAGE
      );
    }
    if (body.scope === 'campus') {
      await this.campuses.assertInScope(ctx, body.scopeId);
      return { scope: 'campus', campusId: body.scopeId };
    }
    const level = await this.billing.findLevel(
      ctx.organizationId,
      body.scopeId
    );
    if (level === undefined) {
      throw new NotFoundException(FEE_LEVEL_NOT_FOUND_MESSAGE);
    }
    return { scope: 'level', classLevelId: level.id };
  }

  async plan(
    ctx: OrgContext,
    term: TermInfo,
    filter: RoundFilter
  ): Promise<RoundPlan & { levelIds: string[] }> {
    const candidates = await this.billing.candidates(
      scopeOf(ctx),
      term,
      schoolToday(ctx, this.clock)
    );
    const included = includedCandidates(candidates, filter, ctx.campusScope);
    const [feeLines, optedIn, discounts, discountsAccountId] =
      await Promise.all([
        this.billing.feeLines(ctx.organizationId, term.id),
        this.billing.optedIn(
          ctx.organizationId,
          included.map((candidate) => candidate.enrollmentId)
        ),
        this.billing.discounts(
          ctx.organizationId,
          included.map((candidate) => candidate.studentId)
        ),
        this.billing.discountsAccountId(ctx.organizationId),
      ]);
    return {
      ...planRound(included, {
        termId: term.id,
        term: term.position,
        feeLines,
        optedIn,
        discounts,
        discountsAccountId,
      }),
      levelIds: [...new Set(candidates.map((row) => row.classLevelId))],
    };
  }
}
