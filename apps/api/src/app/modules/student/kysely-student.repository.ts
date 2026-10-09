import { Inject, Injectable } from '@nestjs/common';
import type { Student } from '@eduvault/api-contract';
import type { CampusScope } from '../../common/campus-scope';
import { inCampusScope } from '../../common/db/in-campus-scope';
import { iso } from '../../common/db/rows';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import {
  StudentRepository,
  type NewStudent,
  type StudentPatch,
} from './student.repository';

interface Row {
  id: string;
  organization_id: string;
  campus_id: string;
  full_name: string;
  admission_number: string;
  created_at: Date | string;
}

const toStudent = (row: Row): Student => ({
  id: row.id,
  organizationId: row.organization_id,
  campusId: row.campus_id,
  fullName: row.full_name,
  admissionNumber: row.admission_number,
  createdAt: iso(row.created_at),
});

@Injectable()
export class KyselyStudentRepository extends StudentRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  async list(
    organizationId: string,
    scope: CampusScope,
    campusId?: string
  ): Promise<Student[]> {
    let query = this.db
      .selectFrom('student')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where((eb) => inCampusScope(eb, 'student.campus_id', { scope }));
    if (campusId !== undefined) {
      query = query.where('campus_id', '=', campusId);
    }
    const rows = await query.orderBy('full_name').orderBy('id').execute();
    return rows.map((row) => toStudent(row));
  }

  async findById(
    organizationId: string,
    scope: CampusScope,
    id: string
  ): Promise<Student | undefined> {
    const row = await this.db
      .selectFrom('student')
      .selectAll()
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .where((eb) => inCampusScope(eb, 'student.campus_id', { scope }))
      .executeTakeFirst();
    return row && toStudent(row);
  }

  async create(organizationId: string, input: NewStudent): Promise<Student> {
    const row = await this.db
      .insertInto('student')
      .values({
        organization_id: organizationId,
        campus_id: input.campusId,
        full_name: input.fullName,
        admission_number: input.admissionNumber,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toStudent(row);
  }

  async update(
    organizationId: string,
    id: string,
    patch: StudentPatch
  ): Promise<Student | undefined> {
    const row = await this.db
      .updateTable('student')
      .set({
        ...(patch.campusId !== undefined && { campus_id: patch.campusId }),
        ...(patch.fullName !== undefined && { full_name: patch.fullName }),
        ...(patch.admissionNumber !== undefined && {
          admission_number: patch.admissionNumber,
        }),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .returningAll()
      .executeTakeFirst();
    return row && toStudent(row);
  }
}
