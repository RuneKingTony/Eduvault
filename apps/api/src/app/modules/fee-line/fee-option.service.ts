import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FEE_OPTION_NOT_OPTIONAL_MESSAGE,
  STUDENT_NOT_FOUND_MESSAGE,
  type FeeOption,
  type FeeOptionResult,
  type SetFeeOptionInput,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { feeScopeOf } from './fee-line.service';
import {
  FeeOptionRepository,
  type StudentFeeContext,
} from './fee-line.repository';

type EnrolledStudent = StudentFeeContext & {
  enrollment: NonNullable<StudentFeeContext['enrollment']>;
};

@Injectable()
export class FeeOptionService {
  constructor(private readonly options: FeeOptionRepository) {}

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
    const { student, sessionId } = await this.context(
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
        sessionId === undefined
          ? []
          : await this.optionalFeeTypes(
              ctx,
              { ...student, enrollment },
              sessionId
            );
      if (!optional.some((feeType) => feeType.feeTypeId === params.feeTypeId)) {
        throw new BadRequestException(FEE_OPTION_NOT_OPTIONAL_MESSAGE);
      }
    }
    await this.options.setOption({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      enrollmentId: enrollment.id,
      feeTypeId: params.feeTypeId,
      optedIn: input.optedIn,
    });
    return { feeTypeId: params.feeTypeId, optedIn: input.optedIn };
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
    const sessionId =
      requested ?? (await this.options.currentSessionId(ctx.organizationId));
    const student = await this.options.findStudent(feeScopeOf(ctx), {
      studentId,
      sessionId,
    });
    if (student === undefined) {
      throw new NotFoundException(STUDENT_NOT_FOUND_MESSAGE);
    }
    return { student, sessionId };
  }
}
