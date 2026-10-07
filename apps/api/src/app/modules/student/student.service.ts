import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Student } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { assertCampusInSchool } from '../../common/campus-guard';
import { canSeeCampus, inCampusScope } from '../../common/campus-scope';
import { KYSELY_TOKEN, type Database } from '../../common/db/database.module';
import { iso } from '../../common/rows';

interface StudentInput {
  campusId?: string | undefined;
  fullName: string;
  admissionNumber: string;
}

type Row = {
  id: string;
  organization_id: string;
  campus_id: string;
  full_name: string;
  admission_number: string;
  created_at: Date | string;
};

@Injectable()
export class StudentService {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {}

  private toStudent(row: Row): Student {
    return {
      id: row.id,
      organizationId: row.organization_id,
      campusId: row.campus_id,
      fullName: row.full_name,
      admissionNumber: row.admission_number,
      createdAt: iso(row.created_at),
    };
  }

  async list(ctx: OrgContext, campusId?: string): Promise<Student[]> {
    if (campusId && !canSeeCampus(ctx.campusScope, campusId)) {
      throw new NotFoundException('Campus not found');
    }
    let query = this.db
      .selectFrom('student')
      .selectAll()
      .where('organization_id', '=', ctx.organizationId)
      .where((eb) => inCampusScope(eb, 'student.campus_id', ctx.campusScope));
    if (campusId) query = query.where('campus_id', '=', campusId);
    const rows = await query.orderBy('full_name').orderBy('id').execute();
    return rows.map((row) => this.toStudent(row));
  }

  async get(ctx: OrgContext, id: string): Promise<Student> {
    const row = await this.db
      .selectFrom('student')
      .selectAll()
      .where('id', '=', id)
      .where('organization_id', '=', ctx.organizationId)
      .where((eb) => inCampusScope(eb, 'student.campus_id', ctx.campusScope))
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Student not found');
    return this.toStudent(row);
  }

  async create(ctx: OrgContext, input: StudentInput): Promise<Student> {
    const campusId = input.campusId ?? ctx.activeCampusId;
    if (!campusId) {
      throw new BadRequestException(
        'campusId is required when the session has no active campus'
      );
    }
    await assertCampusInSchool(this.db, ctx.organizationId, campusId);
    const row = await this.db
      .insertInto('student')
      .values({
        organization_id: ctx.organizationId,
        campus_id: campusId,
        full_name: input.fullName,
        admission_number: input.admissionNumber,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.toStudent(row);
  }

  async update(
    ctx: OrgContext,
    id: string,
    input: Partial<StudentInput>
  ): Promise<Student> {
    await this.get(ctx, id);
    if (input.campusId) {
      await assertCampusInSchool(this.db, ctx.organizationId, input.campusId);
    }
    const row = await this.db
      .updateTable('student')
      .set({
        ...(input.campusId !== undefined && { campus_id: input.campusId }),
        ...(input.fullName !== undefined && { full_name: input.fullName }),
        ...(input.admissionNumber !== undefined && {
          admission_number: input.admissionNumber,
        }),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('organization_id', '=', ctx.organizationId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.toStudent(row);
  }

  async remove(ctx: OrgContext, id: string): Promise<{ id: string }> {
    await this.get(ctx, id);
    await this.db
      .deleteFrom('student')
      .where('id', '=', id)
      .where('organization_id', '=', ctx.organizationId)
      .execute();
    return { id };
  }
}
