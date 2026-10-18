import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FEE_COPY_NO_SOURCE_MESSAGE,
  FEE_EVERY_CAMPUS_MESSAGE,
  FEE_LEVEL_NOT_FOUND_MESSAGE,
  FEE_LINE_ALREADY_RETIRED_MESSAGE,
  FEE_LINE_NOT_FOUND_MESSAGE,
  FEE_LINE_RETIRED_MESSAGE,
  FEE_TERM_ENDED_MESSAGE,
  FEE_TERM_NOT_FOUND_MESSAGE,
  FEE_TYPE_INVALID_MESSAGE,
  FEE_TYPE_NOT_FOUND_MESSAGE,
  feeCopyEmptySourceMessage,
  feeCopyTargetNotEmptyMessage,
  feeLineDuplicateMessage,
  feeTermLabel,
  type CopyFeeLinesInput,
  type CreateFeeLineInput,
  type FeeCopyResult,
  type FeeCopySource,
  type FeeCopyTerm,
  type FeeLine,
  type FeeLineListQuery,
  type FeeSetup,
  type UpdateFeeLineInput,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock, schoolToday } from '../../common/clock';
import { CampusService } from '../campus/campus.service';
import { FeeLineRepository, type TermRef } from './fee-line.repository';
import { feeScopeOf, inFeeGroup } from './fee-scope';

const copyTerm = (term: TermRef): FeeCopyTerm => ({
  id: term.id,
  name: term.name,
  schoolYearName: term.schoolYearName,
});

function assertEveryCampusWrite(ctx: OrgContext, campusId: string | null) {
  if (campusId === null && ctx.campusScope !== 'all') {
    throw new ForbiddenException(FEE_EVERY_CAMPUS_MESSAGE);
  }
}

@Injectable()
export class FeeLineService {
  constructor(
    private readonly lines: FeeLineRepository,
    private readonly campuses: CampusService,
    private readonly clock: Clock
  ) {}

  setup(ctx: OrgContext): Promise<FeeSetup> {
    return this.lines.setup(ctx.organizationId);
  }

  async list(ctx: OrgContext, query: FeeLineListQuery): Promise<FeeLine[]> {
    await this.requireTerm(ctx, query.termId);
    const lines = await this.lines.list(feeScopeOf(ctx), {
      termId: query.termId,
      includeRetired: query.includeRetired,
    });
    return lines.filter(
      (line) =>
        inFeeGroup(line.feeTypeCode, query.group) &&
        (query.feeTypeId === undefined || line.feeTypeId === query.feeTypeId)
    );
  }

  async copySource(ctx: OrgContext, termId: string): Promise<FeeCopySource> {
    await this.requireTerm(ctx, termId);
    const source = await this.lines.previousTerm(ctx.organizationId, termId);
    const sourceTerm = source === undefined ? null : copyTerm(source);
    if (source === undefined || ctx.campusScope !== 'all') {
      return { sourceTerm, liveLineCount: 0, targetHasLines: false };
    }
    const [liveLineCount, targetCount] = await Promise.all([
      this.lines.liveLineCount(ctx.organizationId, source.id),
      this.lines.liveLineCount(ctx.organizationId, termId),
    ]);
    return { sourceTerm, liveLineCount, targetHasLines: targetCount > 0 };
  }

  async copy(
    ctx: OrgContext,
    input: CopyFeeLinesInput
  ): Promise<FeeCopyResult> {
    assertEveryCampusWrite(ctx, null);
    const target = await this.requireTerm(ctx, input.termId);
    this.assertTermOpen(ctx, target);
    const source = await this.lines.previousTerm(ctx.organizationId, target.id);
    if (source === undefined) {
      throw new BadRequestException(FEE_COPY_NO_SOURCE_MESSAGE);
    }
    const sourceLabel = feeTermLabel(source);
    if ((await this.lines.liveLineCount(ctx.organizationId, source.id)) === 0) {
      throw new BadRequestException(feeCopyEmptySourceMessage(sourceLabel));
    }
    const outcome = await this.lines.copyLines({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      fromTermId: source.id,
      toTermId: target.id,
    });
    if (outcome.status === 'source_empty') {
      throw new BadRequestException(feeCopyEmptySourceMessage(sourceLabel));
    }
    if (outcome.status === 'not_empty') {
      throw new ConflictException(
        feeCopyTargetNotEmptyMessage(feeTermLabel(target))
      );
    }
    return { copied: outcome.copied, sourceTerm: copyTerm(source) };
  }

  async create(ctx: OrgContext, input: CreateFeeLineInput): Promise<FeeLine> {
    const { campusId } = input;
    assertEveryCampusWrite(ctx, campusId);
    const campus =
      campusId === null ? null : await this.campuses.get(ctx, campusId);
    const [term, level, feeType] = await Promise.all([
      this.lines.findTerm(ctx.organizationId, input.termId),
      this.lines.findLevel(ctx.organizationId, input.classLevelId),
      this.lines.findFeeType(ctx.organizationId, input.feeTypeId),
    ]);
    if (term === undefined) {
      throw new NotFoundException(FEE_TERM_NOT_FOUND_MESSAGE);
    }
    if (level === undefined) {
      throw new NotFoundException(FEE_LEVEL_NOT_FOUND_MESSAGE);
    }
    if (feeType === undefined) {
      throw await this.feeTypeRefusal(ctx, input.feeTypeId);
    }
    this.assertTermOpen(ctx, term);
    const outcome = await this.lines.create({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      termId: input.termId,
      classLevelId: input.classLevelId,
      feeTypeId: input.feeTypeId,
      campusId,
      name: input.name,
      amountMinor: input.amountMinor,
      appliesTo: input.appliesTo ?? 'all',
      isOptional: input.isOptional ?? false,
    });
    if (outcome.status === 'duplicate') {
      throw new ConflictException(
        feeLineDuplicateMessage({
          feeType: feeType.name,
          level: level.name,
          campus: campus?.name ?? null,
        })
      );
    }
    return outcome.line;
  }

  async updateAmount(
    ctx: OrgContext,
    id: string,
    input: UpdateFeeLineInput
  ): Promise<FeeLine> {
    const line = await this.writable(ctx, id, FEE_LINE_RETIRED_MESSAGE);
    await this.assertLineTermOpen(ctx, line);
    const updated = await this.lines.updateAmount(
      ctx.organizationId,
      id,
      input.amountMinor
    );
    if (updated === undefined) {
      throw new ConflictException(FEE_LINE_RETIRED_MESSAGE);
    }
    return updated;
  }

  async retire(ctx: OrgContext, id: string): Promise<FeeLine> {
    const line = await this.writable(ctx, id, FEE_LINE_ALREADY_RETIRED_MESSAGE);
    await this.assertLineTermOpen(ctx, line);
    const retired = await this.lines.retire(ctx.organizationId, id);
    if (retired === undefined) {
      throw new ConflictException(FEE_LINE_ALREADY_RETIRED_MESSAGE);
    }
    return retired;
  }

  private async writable(
    ctx: OrgContext,
    id: string,
    retiredMessage: string
  ): Promise<FeeLine> {
    const line = await this.lines.findById(feeScopeOf(ctx), id);
    if (line === undefined) {
      throw new NotFoundException(FEE_LINE_NOT_FOUND_MESSAGE);
    }
    assertEveryCampusWrite(ctx, line.campusId);
    if (line.retiredAt !== null) {
      throw new ConflictException(retiredMessage);
    }
    return line;
  }

  private async feeTypeRefusal(
    ctx: OrgContext,
    feeTypeId: string
  ): Promise<Error> {
    return (await this.lines.hasLedgerAccount(ctx.organizationId, feeTypeId))
      ? new BadRequestException(FEE_TYPE_INVALID_MESSAGE)
      : new NotFoundException(FEE_TYPE_NOT_FOUND_MESSAGE);
  }

  private async requireTerm(ctx: OrgContext, termId: string): Promise<TermRef> {
    const term = await this.lines.findTerm(ctx.organizationId, termId);
    if (term === undefined) {
      throw new NotFoundException(FEE_TERM_NOT_FOUND_MESSAGE);
    }
    return term;
  }

  private async assertLineTermOpen(ctx: OrgContext, line: FeeLine) {
    this.assertTermOpen(ctx, await this.requireTerm(ctx, line.termId));
  }

  private assertTermOpen(ctx: OrgContext, term: TermRef): void {
    if (term.endsOn < schoolToday(ctx, this.clock)) {
      throw new BadRequestException(FEE_TERM_ENDED_MESSAGE);
    }
  }
}
