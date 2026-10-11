import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CLASS_NOT_FOUND_MESSAGE,
  SCHOOL_YEAR_NOT_FOUND_MESSAGE,
  START_NOTHING_MESSAGE,
  START_NO_CURRENT_TERM_MESSAGE,
  START_WRONG_YEAR_MESSAGE,
  STUDENT_NOT_FOUND_MESSAGE,
  type NewSchoolYearPreview,
  type StartNewSchoolYearInput,
  type StartNewSchoolYearResult,
} from '@eduvault/api-contract';
import { can } from '@eduvault/policy';
import { requirePermission, type OrgContext } from '../../common/auth';
import { Clock, schoolToday } from '../../common/clock';
import { SchoolLock } from '../../common/db/school-lock';
import {
  duplicateRowError,
  pickTargetYears,
  planGroups,
  planRows,
  type TargetYears,
} from './new-school-year';
import {
  NewSchoolYearRepository,
  type FirstTerm,
  type StartCalendar,
  type YearPair,
} from './new-school-year.repository';

interface StartYearOffer {
  targetYearId: string;
  name: string;
}

interface Offered extends TargetYears {
  calendar: StartCalendar;
}

@Injectable()
export class NewSchoolYearService {
  constructor(
    private readonly repository: NewSchoolYearRepository,
    private readonly lock: SchoolLock,
    private readonly clock: Clock
  ) {}

  private async offered(ctx: OrgContext): Promise<Offered | undefined> {
    const calendar = await this.repository.calendar(ctx.organizationId);
    if (calendar === undefined) {
      return undefined;
    }
    const years = pickTargetYears({
      currentTerm: calendar.currentTerm,
      lastSequence: calendar.lastSequence,
      years: calendar.years,
    });
    return years === null ? undefined : { ...years, calendar };
  }

  private pair(ctx: OrgContext, offered: TargetYears): YearPair {
    return {
      leavingYearId: offered.leaving.id,
      targetYearId: offered.target.id,
      today: schoolToday(ctx, this.clock),
    };
  }

  async offer(ctx: OrgContext): Promise<StartYearOffer | null> {
    if (!can(ctx.permissions, 'enrollment', 'place')) {
      return null;
    }
    const offered = await this.offered(ctx);
    if (offered === undefined) {
      return null;
    }
    const waiting = await this.repository.countWaiting(
      ctx.organizationId,
      ctx.campusScope,
      this.pair(ctx, offered)
    );
    return waiting > 0
      ? { targetYearId: offered.target.id, name: offered.target.name }
      : null;
  }

  async preview(ctx: OrgContext): Promise<NewSchoolYearPreview> {
    const offered = await this.offered(ctx);
    if (offered === undefined) {
      throw new ConflictException(START_NOTHING_MESSAGE);
    }
    const firstTerm = await this.repository.firstTerm(
      ctx.organizationId,
      offered.target.id
    );
    if (firstTerm === undefined) {
      throw new ConflictException(START_NOTHING_MESSAGE);
    }
    const facts = await this.repository.waiting(
      ctx.organizationId,
      ctx.campusScope,
      this.pair(ctx, offered)
    );
    return {
      targetYear: {
        id: offered.target.id,
        name: offered.target.name,
        firstTerm,
      },
      leavingYear: { id: offered.leaving.id, name: offered.leaving.name },
      canGraduate: can(ctx.permissions, 'student', 'archive'),
      alreadyInTargetYear: facts.alreadyInTarget,
      groups: planGroups(facts),
    };
  }

  private async requireTarget(
    ctx: OrgContext,
    targetYearId: string
  ): Promise<{ offered: Offered; firstTerm: FirstTerm }> {
    const calendar = await this.repository.calendar(ctx.organizationId);
    if (calendar === undefined) {
      throw new ConflictException(START_NO_CURRENT_TERM_MESSAGE);
    }
    if (!calendar.years.some((year) => year.id === targetYearId)) {
      throw new NotFoundException(SCHOOL_YEAR_NOT_FOUND_MESSAGE);
    }
    const years = pickTargetYears({
      currentTerm: calendar.currentTerm,
      lastSequence: calendar.lastSequence,
      years: calendar.years,
    });
    if (years === null) {
      throw new ConflictException(START_NOTHING_MESSAGE);
    }
    if (years.target.id !== targetYearId) {
      throw new ConflictException(START_WRONG_YEAR_MESSAGE);
    }
    const firstTerm = await this.repository.firstTerm(
      ctx.organizationId,
      targetYearId
    );
    if (firstTerm === undefined) {
      throw new ConflictException(START_NOTHING_MESSAGE);
    }
    return { offered: { ...years, calendar }, firstTerm };
  }

  async start(
    ctx: OrgContext,
    input: StartNewSchoolYearInput
  ): Promise<StartNewSchoolYearResult> {
    if (input.rows.some((row) => row.outcome === 'graduate')) {
      requirePermission(ctx, 'student:archive');
    }
    const duplicate = duplicateRowError(input.rows);
    if (duplicate !== null) {
      throw new BadRequestException(duplicate);
    }
    return await this.lock.run(ctx.organizationId, () =>
      this.write(ctx, input)
    );
  }

  private async write(
    ctx: OrgContext,
    input: StartNewSchoolYearInput
  ): Promise<StartNewSchoolYearResult> {
    const { offered, firstTerm } = await this.requireTarget(
      ctx,
      input.targetYearId
    );
    const pair = this.pair(ctx, offered);
    const [facts, arms] = await Promise.all([
      this.repository.studentFacts(ctx.organizationId, ctx.campusScope, {
        ...pair,
        studentIds: input.rows.map((row) => row.studentId),
      }),
      this.repository.findArms(
        ctx.organizationId,
        input.rows.flatMap((row) =>
          row.classArmId === undefined ? [] : [row.classArmId]
        )
      ),
    ]);
    const students = new Map(facts.map((fact) => [fact.studentId, fact]));
    if (input.rows.some((row) => !students.has(row.studentId))) {
      throw new NotFoundException(STUDENT_NOT_FOUND_MESSAGE);
    }
    const armsById = new Map(arms.map((arm) => [arm.id, arm]));
    if (
      input.rows.some(
        (row) => row.classArmId !== undefined && !armsById.has(row.classArmId)
      )
    ) {
      throw new NotFoundException(CLASS_NOT_FOUND_MESSAGE);
    }
    const planned = planRows({ rows: input.rows, students, arms: armsById });
    if (!planned.ok) {
      throw new BadRequestException(planned.error);
    }
    const { plan } = planned;
    const written = await this.repository.start({
      organizationId: ctx.organizationId,
      actor: { id: ctx.user.id, name: ctx.user.name },
      currentTerm: offered.calendar.currentTerm,
      leavingYear: offered.leaving,
      targetYear: {
        id: offered.target.id,
        name: offered.target.name,
        firstTermId: firstTerm.id,
      },
      enrolments: plan.enrolments,
      graduates: plan.graduates,
    });
    const handled = written.moved + written.repeating + written.graduated;
    return {
      ...written,
      skipped:
        plan.skipped +
        (plan.enrolments.length + plan.graduates.length - handled),
    };
  }
}
