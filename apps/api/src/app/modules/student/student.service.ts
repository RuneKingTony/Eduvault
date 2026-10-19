import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ADMIT_DOB_MESSAGE,
  STUDENT_NOT_FOUND_MESSAGE,
  contract,
  type RouteQuery,
  type StudentDetail,
  type StudentList,
  type UpdateStudentInput,
} from '@eduvault/api-contract';
import { FINANCE_READ_GATE, can, canAny } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import { CampusService } from '../campus/campus.service';
import { GuardianService } from '../guardian/guardian.service';
import {
  StudentRepository,
  type StudentDetailTarget,
} from './student.repository';
import { campusClassScopeOf, type CampusClassScope } from '../../common/scope';

const ALL_SCOPE: CampusClassScope = { campusScope: 'all', classScope: 'all' };

const financeTarget = (ctx: OrgContext, id: string): StudentDetailTarget => ({
  id,
  withFinance: canAny(ctx.permissions, FINANCE_READ_GATE),
});

const notFound = () => new NotFoundException(STUDENT_NOT_FOUND_MESSAGE);

@Injectable()
export class StudentService {
  constructor(
    private readonly students: StudentRepository,
    private readonly campuses: CampusService,
    private readonly guardians: GuardianService
  ) {}

  async list(
    ctx: OrgContext,
    query: RouteQuery<typeof contract.students.list>
  ): Promise<Omit<StudentList, 'startYear'>> {
    if (query.campusId !== undefined) {
      await this.campuses.assertInScope(ctx, query.campusId);
    }
    return this.students.list(ctx.organizationId, campusClassScopeOf(ctx), {
      ...query,
      withGuardians: can(ctx.permissions, 'guardian', 'read'),
      withFinance: canAny(ctx.permissions, FINANCE_READ_GATE),
    });
  }

  async get(ctx: OrgContext, id: string): Promise<StudentDetail> {
    const detail = await this.read(
      ctx,
      campusClassScopeOf(ctx),
      financeTarget(ctx, id)
    );
    if (!can(ctx.permissions, 'guardian', 'read')) {
      return detail;
    }
    return { ...detail, guardians: await this.guardians.linksOf(ctx, id) };
  }

  /** The detail of a student the caller has just admitted, whatever their scope. */
  async getAdmitted(ctx: OrgContext, id: string): Promise<StudentDetail> {
    const detail = await this.read(ctx, ALL_SCOPE, financeTarget(ctx, id));
    if (!can(ctx.permissions, 'guardian', 'read')) {
      return detail;
    }
    return {
      ...detail,
      guardians: await this.guardians.linksOfAdmitted(ctx, id),
    };
  }

  async update(
    ctx: OrgContext,
    id: string,
    patch: UpdateStudentInput
  ): Promise<StudentDetail> {
    const student = await this.read(ctx, campusClassScopeOf(ctx), {
      id,
      withFinance: false,
    });
    if (student.life === 'left' || student.life === 'graduated') {
      throw new ConflictException(
        `${student.firstName} ${student.lastName} is no longer on the roll.`
      );
    }
    if (
      patch.dateOfBirth !== undefined &&
      patch.dateOfBirth > this.students.today(ctx.organizationId)
    ) {
      throw new BadRequestException(ADMIT_DOB_MESSAGE);
    }
    await this.students.update(ctx.organizationId, id, patch);
    return this.get(ctx, id);
  }

  async assertVisible(ctx: OrgContext, id: string): Promise<void> {
    if (
      !(await this.students.isVisible(
        ctx.organizationId,
        campusClassScopeOf(ctx),
        id
      ))
    ) {
      throw notFound();
    }
  }

  private async read(
    ctx: OrgContext,
    scope: CampusClassScope,
    target: StudentDetailTarget
  ): Promise<StudentDetail> {
    const detail = await this.students.findDetail(
      ctx.organizationId,
      scope,
      target
    );
    if (detail === undefined) {
      throw notFound();
    }
    return detail;
  }
}
