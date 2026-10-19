import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FEE_OPTION_NOT_OPTIONAL_MESSAGE,
  FEE_SESSION_NOT_FOUND_MESSAGE,
  FEE_TERM_NOT_FOUND_MESSAGE,
  FEE_TYPE_NOT_FOUND_MESSAGE,
  STUDENT_NOT_FOUND_MESSAGE,
  type FeeOptIns,
  type FeeOptInsQuery,
  type FeeOptInsResult,
  type FeeOption,
  type FeeOptionResult,
  type SetFeeOptInsInput,
  type SetFeeOptionInput,
} from '@eduvault/api-contract';
import {
  feeOptionChangedActivity,
  financeActorIn,
  type FinanceActor,
} from '../../common/activity';
import type { OrgContext } from '../../common/auth';
import { feeScopeOf } from './fee-scope';
import {
  FeeLineRepository,
  FeeOptionRepository,
  FeeStudentRepository,
  type OptionActivity,
  type OptionChange,
  type StudentFeeContext,
} from './fee-line.repository';

type EnrolledStudent = StudentFeeContext & {
  enrollment: NonNullable<StudentFeeContext['enrollment']>;
};

type PreparedOption = Omit<OptionChange, 'organizationId' | 'userId'>;

@Injectable()
export class FeeOptionService {
  constructor(
    private readonly options: FeeOptionRepository,
    private readonly students: FeeStudentRepository,
    private readonly lines: FeeLineRepository
  ) {}

  async list(
    ctx: OrgContext,
    studentId: string,
    sessionId?: string
  ): Promise<FeeOption[]> {
    const { student, sessionId: session } = await this.context(
      ctx,
      studentId,
      sessionId
    );
    const { enrollment } = student;
    if (enrollment === null || session === undefined) {
      return [];
    }
    const enrolled = { ...student, enrollment };
    const [optional, optedIn] = await Promise.all([
      this.optionalFeeTypes(ctx, enrolled, session),
      this.options.optedInFeeTypeIds(ctx.organizationId, enrollment.id),
    ]);
    return optional.map((feeType) => ({
      ...feeType,
      optedIn: optedIn.includes(feeType.feeTypeId),
    }));
  }

  async set(
    ctx: OrgContext,
    params: { studentId: string; feeTypeId: string },
    input: SetFeeOptionInput
  ): Promise<FeeOptionResult> {
    const sessionId = await this.sessionFor(ctx, input.sessionId);
    const prepared = await this.prepare(ctx, params, {
      optedIn: input.optedIn,
      sessionId,
    });
    await this.apply(ctx, prepared, await this.actor(ctx));
    return { feeTypeId: params.feeTypeId, optedIn: input.optedIn };
  }

  async roster(
    ctx: OrgContext,
    feeTypeId: string,
    query: FeeOptInsQuery
  ): Promise<FeeOptIns> {
    const term = await this.feeTypeAndTerm(ctx, feeTypeId, query.termId);
    const roster = await this.options.optInRoster(feeScopeOf(ctx), {
      sessionId: term.sessionId,
      feeTypeId,
      q: query.q,
    });
    return { schoolYearName: term.schoolYearName, ...roster };
  }

  async setMany(
    ctx: OrgContext,
    feeTypeId: string,
    input: SetFeeOptInsInput
  ): Promise<FeeOptInsResult> {
    const { sessionId } = await this.feeTypeAndTerm(
      ctx,
      feeTypeId,
      input.termId
    );
    const prepared: PreparedOption[] = [];
    for (const studentId of new Set(input.studentIds)) {
      prepared.push(
        await this.prepare(
          ctx,
          { studentId, feeTypeId },
          { optedIn: input.optedIn, sessionId }
        )
      );
    }
    const actor = await this.actor(ctx);
    const changed = await this.options.setOptions(
      prepared.map((option) => this.toRepositoryChange(ctx, option, actor))
    );
    return {
      feeTypeId,
      optedIn: input.optedIn,
      changed,
      unchanged: prepared.length - changed,
    };
  }

  private async feeTypeAndTerm(
    ctx: OrgContext,
    feeTypeId: string,
    termId: string
  ) {
    const [feeType, term] = await Promise.all([
      this.lines.findFeeType(ctx.organizationId, feeTypeId),
      this.lines.findTerm(ctx.organizationId, termId),
    ]);
    if (feeType === undefined) {
      throw new NotFoundException(FEE_TYPE_NOT_FOUND_MESSAGE);
    }
    if (term === undefined) {
      throw new NotFoundException(FEE_TERM_NOT_FOUND_MESSAGE);
    }
    return term;
  }

  private async prepare(
    ctx: OrgContext,
    params: { studentId: string; feeTypeId: string },
    input: { optedIn: boolean; sessionId: string | undefined }
  ): Promise<PreparedOption> {
    const student = await this.findStudent(
      ctx,
      params.studentId,
      input.sessionId
    );
    const { enrollment } = student;
    if (enrollment === null) {
      throw new BadRequestException(FEE_OPTION_NOT_OPTIONAL_MESSAGE);
    }
    if (input.optedIn) {
      const optional =
        input.sessionId === undefined
          ? []
          : await this.optionalFeeTypes(
              ctx,
              { ...student, enrollment },
              input.sessionId
            );
      if (!optional.some((feeType) => feeType.feeTypeId === params.feeTypeId)) {
        throw new BadRequestException(FEE_OPTION_NOT_OPTIONAL_MESSAGE);
      }
    }
    return {
      studentId: params.studentId,
      enrollmentId: enrollment.id,
      feeTypeId: params.feeTypeId,
      optedIn: input.optedIn,
    };
  }

  private actor(ctx: OrgContext): Promise<FinanceActor> {
    return financeActorIn(ctx, {
      currency: () => this.lines.currency(ctx.organizationId),
    });
  }

  private apply(
    ctx: OrgContext,
    prepared: PreparedOption,
    actor: FinanceActor
  ): Promise<boolean> {
    const { change, activity } = this.toRepositoryChange(ctx, prepared, actor);
    return this.options.setOption(change, activity);
  }

  private toRepositoryChange(
    ctx: OrgContext,
    prepared: PreparedOption,
    actor: FinanceActor
  ): { change: OptionChange; activity: OptionActivity } {
    return {
      change: {
        ...prepared,
        organizationId: ctx.organizationId,
        userId: ctx.user.id,
      },
      activity: (facts) =>
        feeOptionChangedActivity(actor, {
          ...facts,
          enrollmentId: prepared.enrollmentId,
          optedIn: prepared.optedIn,
        }),
    };
  }

  private optionalFeeTypes(
    ctx: OrgContext,
    student: EnrolledStudent,
    sessionId: string
  ) {
    return this.options.optionalFeeTypes(ctx.organizationId, {
      sessionId,
      classLevelId: student.enrollment.classLevelId,
      enrollmentId: student.enrollment.id,
      homeCampusId: student.homeCampusId,
    });
  }

  private async context(
    ctx: OrgContext,
    studentId: string,
    requested: string | undefined
  ): Promise<{ student: StudentFeeContext; sessionId: string | undefined }> {
    const sessionId = await this.sessionFor(ctx, requested);
    return {
      student: await this.findStudent(ctx, studentId, sessionId),
      sessionId,
    };
  }

  private async sessionFor(
    ctx: OrgContext,
    requested: string | undefined
  ): Promise<string | undefined> {
    if (
      requested !== undefined &&
      !(await this.options.hasSession(ctx.organizationId, requested))
    ) {
      throw new NotFoundException(FEE_SESSION_NOT_FOUND_MESSAGE);
    }
    return (
      requested ?? (await this.options.currentSessionId(ctx.organizationId))
    );
  }

  private async findStudent(
    ctx: OrgContext,
    studentId: string,
    sessionId: string | undefined
  ): Promise<StudentFeeContext> {
    const student = await this.students.findStudent(feeScopeOf(ctx), {
      studentId,
      sessionId,
    });
    if (student === undefined) {
      throw new NotFoundException(STUDENT_NOT_FOUND_MESSAGE);
    }
    return student;
  }
}
