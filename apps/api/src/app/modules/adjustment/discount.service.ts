import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ADJUSTMENT_STUDENT_NOT_FOUND_MESSAGE,
  DISCOUNT_FEE_TYPE_MESSAGE,
  DISCOUNT_FEE_TYPE_NOT_FOUND_MESSAGE,
  DISCOUNT_NOT_APPROVED_MESSAGE,
  DISCOUNT_NOT_FOUND_MESSAGE,
  DISCOUNT_PERCENT_MESSAGE,
  DISCOUNT_TERM_NOT_FOUND_MESSAGE,
  type CreateStudentDiscount,
  type CreatedStudentDiscount,
  type EndStudentDiscountInput,
  type StudentDiscount,
  type StudentDiscountList,
  type StudentDiscountListQuery,
} from '@eduvault/api-contract';
import { assertDeclineReason, decide } from '../../common/approvals';
import type { OrgContext } from '../../common/auth';
import type { AdjustmentScope } from './adjustment.repository';
import { endProblem, termsProblem } from './discount-rules';
import {
  DiscountRepository,
  type TermChoice,
  type TermInfo,
} from './discount.repository';

const scopeOf = (ctx: OrgContext): AdjustmentScope => ({
  organizationId: ctx.organizationId,
  campusScope: ctx.campusScope,
});

const notFound = () => new NotFoundException(DISCOUNT_NOT_FOUND_MESSAGE);

@Injectable()
export class DiscountService {
  constructor(private readonly discounts: DiscountRepository) {}

  async list(
    ctx: OrgContext,
    query: StudentDiscountListQuery
  ): Promise<StudentDiscountList> {
    const [currency, page] = await Promise.all([
      this.discounts.currency(ctx.organizationId),
      this.discounts.list(scopeOf(ctx), query),
    ]);
    return { currency, ...page };
  }

  termChoices(ctx: OrgContext): Promise<TermChoice[]> {
    return this.discounts.termChoices(ctx.organizationId);
  }

  async create(
    ctx: OrgContext,
    input: CreateStudentDiscount
  ): Promise<CreatedStudentDiscount> {
    const scope = scopeOf(ctx);
    if (input.kind === 'percent' && input.value > 100) {
      throw new BadRequestException(DISCOUNT_PERCENT_MESSAGE);
    }
    if (!(await this.discounts.studentInScope(scope, input.studentId))) {
      throw new NotFoundException(ADJUSTMENT_STUDENT_NOT_FOUND_MESSAGE);
    }
    await this.checkFeeType(ctx.organizationId, input.ledgerAccountId);
    await this.checkTerms(ctx.organizationId, input);
    const autoApproved = !(await this.discounts.approvalOn(ctx.organizationId));
    const id = await this.discounts.insert({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      studentId: input.studentId,
      kind: input.kind,
      value: input.value,
      ledgerAccountId: input.ledgerAccountId,
      fromTermId: input.fromTermId,
      toTermId: input.toTermId ?? null,
      reason: input.reason,
      autoApproved,
    });
    return { discount: await this.item(scope, id), autoApproved };
  }

  async approve(ctx: OrgContext, id: string): Promise<StudentDiscount> {
    const scope = scopeOf(ctx);
    const found = await this.discounts.findById(scope, id);
    if (found === undefined) {
      throw notFound();
    }
    await decide({ actorId: ctx.user.id, createdBy: found.createdById }, () =>
      this.discounts.approve(scope, id, ctx.user.id)
    );
    return this.item(scope, id);
  }

  async decline(
    ctx: OrgContext,
    id: string,
    reason: string
  ): Promise<StudentDiscount> {
    const declineReason = assertDeclineReason(reason);
    const scope = scopeOf(ctx);
    const found = await this.discounts.findById(scope, id);
    if (found === undefined) {
      throw notFound();
    }
    await decide({ actorId: ctx.user.id, createdBy: found.createdById }, () =>
      this.discounts.reject(scope, id, {
        userId: ctx.user.id,
        reason: declineReason,
      })
    );
    return this.item(scope, id);
  }

  async end(
    ctx: OrgContext,
    id: string,
    input: EndStudentDiscountInput
  ): Promise<StudentDiscount> {
    const scope = scopeOf(ctx);
    const found = await this.discounts.findById(scope, id);
    if (found === undefined) {
      throw notFound();
    }
    if (found.status !== 'approved') {
      throw new ConflictException(DISCOUNT_NOT_APPROVED_MESSAGE);
    }
    const [last, current] = await Promise.all([
      this.requireTerm(ctx.organizationId, input.lastTermId),
      this.discounts.currentTerm(ctx.organizationId),
    ]);
    const problem = endProblem({
      last: last.position,
      until: found.until,
      current: current?.position,
    });
    if (problem !== undefined) {
      throw new BadRequestException(problem);
    }
    const ended = await this.discounts.end(scope, id, {
      userId: ctx.user.id,
      lastTermId: input.lastTermId,
    });
    if (!ended) {
      throw new ConflictException(DISCOUNT_NOT_APPROVED_MESSAGE);
    }
    return this.item(scope, id);
  }

  private async checkFeeType(
    organizationId: string,
    ledgerAccountId: string | null
  ): Promise<void> {
    if (ledgerAccountId === null) {
      return;
    }
    const found = await this.discounts.feeType(organizationId, ledgerAccountId);
    if (found === 'missing') {
      throw new NotFoundException(DISCOUNT_FEE_TYPE_NOT_FOUND_MESSAGE);
    }
    if (found === 'not_fee_type') {
      throw new BadRequestException(DISCOUNT_FEE_TYPE_MESSAGE);
    }
  }

  private async checkTerms(
    organizationId: string,
    input: CreateStudentDiscount
  ): Promise<void> {
    const [from, to, current] = await Promise.all([
      this.requireTerm(organizationId, input.fromTermId),
      input.toTermId === undefined || input.toTermId === null
        ? undefined
        : this.requireTerm(organizationId, input.toTermId),
      this.discounts.currentTerm(organizationId),
    ]);
    const problem = termsProblem({
      from: from.position,
      to: to?.position ?? null,
      current: current?.position,
    });
    if (problem !== undefined) {
      throw new BadRequestException(problem);
    }
  }

  private async requireTerm(
    organizationId: string,
    termId: string
  ): Promise<TermInfo> {
    const term = await this.discounts.term(organizationId, termId);
    if (term === undefined) {
      throw new NotFoundException(DISCOUNT_TERM_NOT_FOUND_MESSAGE);
    }
    return term;
  }

  private async item(
    scope: AdjustmentScope,
    id: string
  ): Promise<StudentDiscount> {
    const found = await this.discounts.findById(scope, id);
    if (found === undefined) {
      throw notFound();
    }
    return found.discount;
  }
}
