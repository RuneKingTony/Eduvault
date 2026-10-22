import { sql, type Kysely } from 'kysely';
import { splitRoles } from '@eduvault/policy';
import type { ActivityInput, ActivityWriter } from '../activity';
import type { DB } from '../../../db/db-types';
import { escapeLike } from '../db/escape-like';
import { addMemberRole, stripMemberRole } from '../auth/member-rows';
import {
  createPortalLogin,
  resetPortalPassword,
  type NewPortalLogin,
} from '../auth/portal-login';
import type {
  GuardianRecord,
  GuardianTx,
  LinkKey,
  LoginHolds,
  LinkPatch,
  LinkRecord,
  NewGuardianRow,
  NewLinkRow,
  SchoolRules,
  StudentFacts,
} from './guardian-tx';
import { readSchoolRules } from './school-rules';

const toGuardian = (row: {
  id: string;
  full_name: string;
  user_id: string;
  email: string | null;
}): GuardianRecord => ({
  id: row.id,
  fullName: row.full_name,
  userId: row.user_id,
  email: row.email,
});

export class KyselyGuardianTx implements GuardianTx {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly activity: ActivityWriter
  ) {}

  async lockStudent(
    organizationId: string,
    studentId: string
  ): Promise<StudentFacts | undefined> {
    const row = await this.db
      .selectFrom('student')
      .select(['id', 'first_name', 'last_name', 'exit_kind', 'campus_id'])
      .where('id', '=', studentId)
      .where('organization_id', '=', organizationId)
      .forUpdate()
      .executeTakeFirst();
    return (
      row && {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        onRoll: row.exit_kind === null,
        campusId: row.campus_id,
      }
    );
  }

  rules(organizationId: string): Promise<SchoolRules> {
    return readSchoolRules(this.db, organizationId);
  }

  async linksOf(
    organizationId: string,
    studentId: string
  ): Promise<LinkRecord[]> {
    const rows = await this.db
      .selectFrom('guardian_student')
      .select(['guardian_id', 'pays_fees'])
      .where('organization_id', '=', organizationId)
      .where('student_id', '=', studentId)
      .execute();
    return rows.map((row) => ({
      guardianId: row.guardian_id,
      paysFees: row.pays_fees,
    }));
  }

  async findGuardian(
    organizationId: string,
    guardianId: string
  ): Promise<GuardianRecord | undefined> {
    const row = await this.db
      .selectFrom('guardian')
      .select(['id', 'full_name', 'user_id', 'email'])
      .where('id', '=', guardianId)
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();
    return row && toGuardian(row);
  }

  async findGuardianByEmail(
    organizationId: string,
    email: string
  ): Promise<GuardianRecord | undefined> {
    const row = await this.db
      .selectFrom('guardian')
      .select(['id', 'full_name', 'user_id', 'email'])
      .where('organization_id', '=', organizationId)
      .where(sql<string>`lower(email)`, '=', email.toLowerCase())
      .executeTakeFirst();
    return row && toGuardian(row);
  }

  async findUserByEmail(email: string): Promise<{ id: string } | undefined> {
    return this.db
      .selectFrom('user')
      .select('id')
      .where('email', '=', email.toLowerCase())
      .executeTakeFirst();
  }

  async lockLogin(userId: string): Promise<LoginHolds | undefined> {
    const user = await this.db
      .selectFrom('user')
      .select('role')
      .where('id', '=', userId)
      .forUpdate()
      .executeTakeFirst();
    if (user === undefined) {
      return undefined;
    }
    const members = await this.db
      .selectFrom('member')
      .select(['organizationId', 'role'])
      .where('userId', '=', userId)
      .execute();
    const guardianRows = await this.db
      .selectFrom('guardian')
      .select('organization_id')
      .where('user_id', '=', userId)
      .execute();
    const memberships = members.map((member) => ({
      organizationId: member.organizationId,
      roles: splitRoles(member.role),
    }));
    for (const row of guardianRows) {
      if (!memberships.some((m) => m.organizationId === row.organization_id)) {
        memberships.push({ organizationId: row.organization_id, roles: [] });
      }
    }
    return { platformRole: user.role, memberships };
  }

  resetPassword(userId: string, passwordHash: string): Promise<void> {
    return resetPortalPassword(this.db, { userId, passwordHash });
  }

  async takenUsernames(base: string): Promise<ReadonlySet<string>> {
    const rows = await this.db
      .selectFrom('user')
      .select('username')
      .where('username', 'like', `${escapeLike(base)}%`)
      .execute();
    return new Set(rows.flatMap((row) => row.username ?? []));
  }

  async createLogin(input: NewPortalLogin): Promise<string> {
    const { userId } = await createPortalLogin(this.db, input);
    return userId;
  }

  addRole(organizationId: string, userId: string, role: string) {
    return addMemberRole(this.db, { organizationId, userId, role });
  }

  stripRole(organizationId: string, userId: string, role: string) {
    return stripMemberRole(this.db, { organizationId, userId, role });
  }

  async insertGuardian(row: NewGuardianRow): Promise<string> {
    const inserted = await this.db
      .insertInto('guardian')
      .values({
        organization_id: row.organizationId,
        full_name: row.fullName,
        phone: row.phone,
        email: row.email,
        address: row.address,
        photo_file_id: row.photoFileId,
        user_id: row.userId,
        created_by: row.createdBy,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return inserted.id;
  }

  async insertLink(row: NewLinkRow): Promise<void> {
    await this.db
      .insertInto('guardian_student')
      .values({
        organization_id: row.organizationId,
        guardian_id: row.guardianId,
        student_id: row.studentId,
        relationship: row.relationship,
        pays_fees: row.paysFees,
        created_by: row.createdBy,
      })
      .execute();
  }

  async updateLink(key: LinkKey, patch: LinkPatch): Promise<void> {
    await this.db
      .updateTable('guardian_student')
      .set({
        ...(patch.relationship === undefined
          ? {}
          : { relationship: patch.relationship }),
        ...(patch.paysFees === undefined ? {} : { pays_fees: patch.paysFees }),
      })
      .where('organization_id', '=', key.organizationId)
      .where('student_id', '=', key.studentId)
      .where('guardian_id', '=', key.guardianId)
      .execute();
  }

  async deleteLink(key: LinkKey): Promise<void> {
    await this.db
      .deleteFrom('guardian_student')
      .where('organization_id', '=', key.organizationId)
      .where('student_id', '=', key.studentId)
      .where('guardian_id', '=', key.guardianId)
      .execute();
  }

  async countLinksOfGuardian(
    organizationId: string,
    guardianId: string
  ): Promise<number> {
    const row = await this.db
      .selectFrom('guardian_student')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('organization_id', '=', organizationId)
      .where('guardian_id', '=', guardianId)
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  async photoIsFree(organizationId: string, fileId: string): Promise<boolean> {
    const file = await this.db
      .selectFrom('file_object')
      .select('id')
      .where('id', '=', fileId)
      .where('organization_id', '=', organizationId)
      .where('kind', '=', 'guardian_photo')
      .forShare()
      .executeTakeFirst();
    if (file === undefined) {
      return false;
    }
    const taken = await this.db
      .selectFrom('guardian')
      .select('id')
      .where('organization_id', '=', organizationId)
      .where('photo_file_id', '=', fileId)
      .executeTakeFirst();
    return taken === undefined;
  }

  recordActivity(input: ActivityInput): Promise<void> {
    return this.activity.record(this.db, input);
  }
}
