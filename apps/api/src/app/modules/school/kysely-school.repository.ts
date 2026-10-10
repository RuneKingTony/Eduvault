import { Inject, Injectable } from '@nestjs/common';
import { splitRoles } from '@eduvault/policy';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { SchoolRepository, type StaffRecord } from './school.repository';

interface Row {
  id: string;
  userId: string;
  name: string;
  title: string | null;
  role: string;
}

const toStaff = (row: Row): StaffRecord => ({
  memberId: row.id,
  userId: row.userId,
  name: row.name,
  title: row.title,
  roles: splitRoles(row.role),
});

@Injectable()
export class KyselySchoolRepository extends SchoolRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  private staff(organizationId: string) {
    return this.db
      .selectFrom('member')
      .innerJoin('user', 'user.id', 'member.userId')
      .where('member.organizationId', '=', organizationId)
      .select([
        'member.id',
        'member.userId',
        'user.name',
        'member.title',
        'member.role',
      ]);
  }

  async findStaff(
    organizationId: string,
    userId: string
  ): Promise<StaffRecord | undefined> {
    const row = await this.staff(organizationId)
      .where('member.userId', '=', userId)
      .executeTakeFirst();
    return row && toStaff(row);
  }

  async listStaff(organizationId: string): Promise<StaffRecord[]> {
    const rows = await this.staff(organizationId)
      .orderBy('user.name')
      .orderBy('member.id')
      .execute();
    return rows.map((row) => toStaff(row));
  }

  async schoolName(organizationId: string): Promise<string | undefined> {
    const row = await this.db
      .selectFrom('school_account')
      .select('name')
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();
    return row?.name;
  }

  async hasStudents(organizationId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('student')
      .select('id')
      .where('organization_id', '=', organizationId)
      .limit(1)
      .executeTakeFirst();
    return row !== undefined;
  }
}
