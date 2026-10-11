import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  STUDENT_NOT_FOUND_MESSAGE,
  contract,
  type RouteQuery,
  type StudentDetail,
  type StudentList,
  type UpdateStudentInput,
} from '@eduvault/api-contract';
import { can } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import { CampusService } from '../campus/campus.service';
import { GuardianService } from '../guardian/guardian.service';
import { StudentRepository } from './student.repository';
import { scopeOf, type StudentScope } from './visibility';

const ALL_SCOPE: StudentScope = { campusScope: 'all', classScope: 'all' };

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
    const result = await this.students.list(ctx.organizationId, scopeOf(ctx), {
      ...query,
      withGuardians: can(ctx.permissions, 'guardian', 'read'),
    });
    return result;
  }

  async get(ctx: OrgContext, id: string): Promise<StudentDetail> {
    const detail = await this.read(ctx, scopeOf(ctx), id);
    if (!can(ctx.permissions, 'guardian', 'read')) {
      return detail;
    }
    return { ...detail, guardians: await this.guardians.linksOf(ctx, id) };
  }

  /** The detail of a student the caller has just admitted, whatever their scope. */
  async getAdmitted(ctx: OrgContext, id: string): Promise<StudentDetail> {
    const detail = await this.read(ctx, ALL_SCOPE, id);
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
    const student = await this.read(ctx, scopeOf(ctx), id);
    if (student.life === 'left' || student.life === 'graduated') {
      throw new ConflictException(
        `${student.firstName} ${student.lastName} is no longer on the roll.`
      );
    }
    await this.students.update(ctx.organizationId, id, patch);
    return this.get(ctx, id);
  }

  async assertVisible(ctx: OrgContext, id: string): Promise<void> {
    if (
      !(await this.students.isVisible(ctx.organizationId, scopeOf(ctx), id))
    ) {
      throw notFound();
    }
  }

  private async read(
    ctx: OrgContext,
    scope: StudentScope,
    id: string
  ): Promise<StudentDetail> {
    const detail = await this.students.findDetail(
      ctx.organizationId,
      scope,
      id
    );
    if (detail === undefined) {
      throw notFound();
    }
    return detail;
  }
}
