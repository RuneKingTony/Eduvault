import { Injectable, NotFoundException } from '@nestjs/common';
import {
  FEE_PREVIEW_STUDENT_MESSAGE,
  FEE_TERM_NOT_FOUND_MESSAGE,
  type FeeCandidates,
  type FeeCandidatesQuery,
  type FeePreview,
  type FeePreviewLine,
  type FeePreviewQuery,
} from '@eduvault/api-contract';
import { can } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import {
  chargeLines,
  chargeTotal,
  pendingDiscountReasons,
} from '../../common/fees';
import {
  FeeLineRepository,
  FeeOptionRepository,
  FeeStudentRepository,
  type ChargeFacts,
  type StudentFeeContext,
  type TermRef,
} from './fee-line.repository';
import { feeScopeOf } from './fee-scope';

const DISCOUNTS_GIVEN_NAME = 'Discounts given';

type EnrolledStudent = StudentFeeContext & {
  enrollment: NonNullable<StudentFeeContext['enrollment']>;
};

interface PriceFor {
  term: TermRef;
  student: EnrolledStudent;
  campusId: string;
  facts: ChargeFacts;
}

function studentSummary(student: EnrolledStudent): FeePreview['student'] {
  const placed = student.placement ?? student.latestPlacement;
  return {
    id: student.studentId,
    name: student.name,
    armName: student.placement?.armName ?? null,
    levelName: student.enrollment.levelName,
    campusId: placed?.campusId ?? student.homeCampusId,
    campusName: placed?.campusName ?? student.homeCampusName,
    isNew: student.enrollment.isNew,
  };
}

@Injectable()
export class FeePreviewService {
  constructor(
    private readonly lines: FeeLineRepository,
    private readonly options: FeeOptionRepository,
    private readonly students: FeeStudentRepository
  ) {}

  async preview(ctx: OrgContext, query: FeePreviewQuery): Promise<FeePreview> {
    const term = await this.lines.findTerm(ctx.organizationId, query.termId);
    if (term === undefined) {
      throw new NotFoundException(FEE_TERM_NOT_FOUND_MESSAGE);
    }
    const student = await this.enrolledStudent(ctx, query.studentId, term);
    const summary = studentSummary(student);
    const facts = await this.chargeFacts(ctx, student, term);
    const lines = await this.priceLines(ctx, {
      term,
      student,
      campusId: summary.campusId,
      facts,
    });
    return {
      currency: await this.lines.currency(ctx.organizationId),
      student: summary,
      ...(can(ctx.permissions, 'invoice', 'read') && {
        charged: facts.charged,
      }),
      lines,
      totalMinor: chargeTotal(lines),
      pendingDiscounts: pendingDiscountReasons(facts.discounts, facts.term),
    };
  }

  async candidates(
    ctx: OrgContext,
    query: FeeCandidatesQuery
  ): Promise<FeeCandidates> {
    const term = await this.lines.findTerm(ctx.organizationId, query.termId);
    if (term === undefined) {
      throw new NotFoundException(FEE_TERM_NOT_FOUND_MESSAGE);
    }
    return this.students.candidates(feeScopeOf(ctx), {
      sessionId: term.sessionId,
      q: query.q,
    });
  }

  private async chargeFacts(
    ctx: OrgContext,
    student: EnrolledStudent,
    term: TermRef
  ): Promise<ChargeFacts> {
    const facts = await this.students.chargeFacts(ctx.organizationId, {
      studentId: student.studentId,
      termId: term.id,
    });
    return can(ctx.permissions, 'invoice', 'read')
      ? facts
      : { ...facts, charged: null, discounts: [] };
  }

  private async enrolledStudent(
    ctx: OrgContext,
    studentId: string,
    term: TermRef
  ): Promise<EnrolledStudent> {
    const student = await this.students.findStudent(feeScopeOf(ctx), {
      studentId,
      sessionId: term.sessionId,
      termId: term.id,
    });
    const enrollment = student?.enrollment ?? null;
    if (student === undefined || enrollment === null) {
      throw new NotFoundException(FEE_PREVIEW_STUDENT_MESSAGE);
    }
    return { ...student, enrollment };
  }

  private async priceLines(
    ctx: OrgContext,
    { term, student, campusId, facts }: PriceFor
  ): Promise<FeePreviewLine[]> {
    const [live, optedIn] = await Promise.all([
      this.lines.list(
        { organizationId: ctx.organizationId, campusScope: 'all' },
        {
          termId: term.id,
          includeRetired: false,
        }
      ),
      this.options.optedInFeeTypeIds(ctx.organizationId, student.enrollment.id),
    ]);
    const feeLines = new Map(live.map((line) => [line.id, line]));
    return chargeLines({
      feeLines: live,
      student: {
        termId: term.id,
        classLevelId: student.enrollment.classLevelId,
        campusId,
        isNew: student.enrollment.isNew,
        optedInFeeTypeIds: new Set(optedIn),
      },
      discounts: facts.discounts,
      term: facts.term,
      discountsAccountId: facts.discountsAccountId,
    }).map((line) => {
      const fee =
        line.feeLineId === null ? undefined : feeLines.get(line.feeLineId);
      return {
        feeLineId: line.feeLineId,
        description: line.description,
        feeTypeName: fee?.feeTypeName ?? DISCOUNTS_GIVEN_NAME,
        amountMinor: line.amountMinor,
        optedIn: fee?.isOptional ?? false,
        campusName: fee?.campusName ?? null,
      };
    });
  }
}
