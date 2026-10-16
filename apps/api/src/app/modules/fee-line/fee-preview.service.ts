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
import type { OrgContext } from '../../common/auth';
import { applicableLines } from '../../common/fees';
import {
  FeeLineRepository,
  FeeOptionRepository,
  FeeStudentRepository,
  type StudentFeeContext,
  type TermRef,
} from './fee-line.repository';
import { feeScopeOf } from './fee-scope';

type EnrolledStudent = StudentFeeContext & {
  enrollment: NonNullable<StudentFeeContext['enrollment']>;
};

interface PriceFor {
  term: TermRef;
  student: EnrolledStudent;
  campusId: string;
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
    const campusId = student.placement?.campusId ?? student.homeCampusId;
    const lines = await this.priceLines(ctx, { term, student, campusId });
    return {
      currency: await this.lines.currency(ctx.organizationId),
      student: {
        id: student.studentId,
        name: student.name,
        armName: student.placement?.armName ?? null,
        levelName: student.enrollment.levelName,
        campusId,
        campusName: student.placement?.campusName ?? student.homeCampusName,
        isNew: student.enrollment.isNew,
      },
      charged: null,
      lines,
      totalMinor: lines.reduce((sum, line) => sum + line.amountMinor, 0),
      pendingDiscounts: [],
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
    { term, student, campusId }: PriceFor
  ): Promise<FeePreviewLine[]> {
    const [live, optedIn] = await Promise.all([
      this.lines.list(feeScopeOf(ctx), {
        termId: term.id,
        includeRetired: false,
      }),
      this.options.optedInFeeTypeIds(ctx.organizationId, student.enrollment.id),
    ]);
    return applicableLines(live, {
      termId: term.id,
      classLevelId: student.enrollment.classLevelId,
      campusId,
      isNew: student.enrollment.isNew,
      optedInFeeTypeIds: new Set(optedIn),
    }).map((line) => ({
      feeLineId: line.id,
      description: line.name,
      feeTypeName: line.feeTypeName,
      amountMinor: line.amountMinor,
      optedIn: line.isOptional,
      campusName: line.campusName,
    }));
  }
}
