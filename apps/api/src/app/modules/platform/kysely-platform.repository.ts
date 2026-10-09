import { Inject, Injectable } from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import type {
  PlatformSchool,
  PlatformSchoolMember,
} from '@eduvault/api-contract';
import { OWNER_ROLE, MEMBER_ROLE, splitRoles } from '@eduvault/policy';
import type { DB } from '../../../db/db-types';
import type { PlatformAuditEntry } from '../../common/audit';
import { insertPlatformAudit } from '../../common/audit/kysely-audit.repository';
import { iso } from '../../common/db/rows';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { ownerRoles } from './owner-roles';
import {
  PlatformRepository,
  type NewSchoolAccountRow,
  type OwnerReplacement,
  type SchoolKey,
  type SchoolPage,
  type SchoolTotals,
} from './platform.repository';

interface SchoolRow {
  id: string;
  name: string;
  slug: string;
  admission_prefix: string;
  city: string | null;
  createdAt: Date | string;
  suspended_at: Date | string | null;
  students: string | number;
  campuses: string | number;
}

interface OwnerRow {
  organizationId: string;
  id: string;
  name: string;
  email: string;
}

const toSchool = (
  row: SchoolRow,
  owners: Omit<OwnerRow, 'organizationId'>[]
): PlatformSchool => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  admissionPrefix: row.admission_prefix,
  city: row.city,
  owners,
  students: Number(row.students),
  campuses: Number(row.campuses),
  status: row.suspended_at === null ? 'active' : 'suspended',
  createdAt: iso(row.createdAt),
});

const escapeLike = (text: string) =>
  text.replaceAll(/[\\%_]/g, String.raw`\$&`);

const toMember = ({
  role,
  ...member
}: Omit<PlatformSchoolMember, 'roles'> & {
  role: string;
}): PlatformSchoolMember => ({ ...member, roles: splitRoles(role) });

@Injectable()
export class KyselyPlatformRepository extends PlatformRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  private selectSchools() {
    return this.db
      .selectFrom('organization')
      .innerJoin(
        'school_account',
        'school_account.organization_id',
        'organization.id'
      )
      .select([
        'organization.id',
        'organization.name',
        'organization.slug',
        'organization.createdAt',
        'school_account.admission_prefix',
        'school_account.city',
        'school_account.suspended_at',
        sql<string>`(SELECT count(*) FROM student WHERE student.organization_id = organization.id)`.as(
          'students'
        ),
        sql<string>`(SELECT count(*) FROM campus WHERE campus.organization_id = organization.id)`.as(
          'campuses'
        ),
      ]);
  }

  private async ownersOf(organizationIds: string[]): Promise<OwnerRow[]> {
    if (organizationIds.length === 0) {
      return [];
    }
    return this.db
      .selectFrom('member')
      .innerJoin('user', 'user.id', 'member.userId')
      .select(['member.organizationId', 'user.id', 'user.name', 'user.email'])
      .where('member.organizationId', 'in', organizationIds)
      .where(sql<boolean>`'owner' = ANY(string_to_array(member.role, ','))`)
      .orderBy('user.name')
      .orderBy('user.id')
      .execute();
  }

  private async withOwners(rows: SchoolRow[]): Promise<PlatformSchool[]> {
    const owners = await this.ownersOf(rows.map((row) => row.id));
    return rows.map((row) =>
      toSchool(
        row,
        owners
          .filter((owner) => owner.organizationId === row.id)
          .map(({ id, name, email }) => ({ id, name, email }))
      )
    );
  }

  async listSchools(input: {
    q?: string;
    after?: SchoolKey;
    limit: number;
  }): Promise<SchoolPage> {
    let query = this.selectSchools();
    if (input.q !== undefined && input.q !== '') {
      const pattern = `%${escapeLike(input.q)}%`;
      query = query.where((eb) =>
        eb.or([
          eb('organization.name', 'ilike', pattern),
          eb('organization.slug', 'ilike', pattern),
        ])
      );
    }
    if (input.after !== undefined) {
      const { name, id } = input.after;
      query = query.where(
        sql<boolean>`(organization.name, organization.id) > (${name}, ${id})`
      );
    }
    const rows = await query
      .orderBy('organization.name')
      .orderBy('organization.id')
      .limit(input.limit + 1)
      .execute();
    const kept = rows.slice(0, input.limit);
    const last = kept.at(-1);
    return {
      items: await this.withOwners(kept),
      next:
        rows.length > input.limit && last !== undefined
          ? { name: last.name, id: last.id }
          : undefined,
    };
  }

  listSchoolOptions(): Promise<{ id: string; name: string }[]> {
    return this.db
      .selectFrom('organization')
      .innerJoin(
        'school_account',
        'school_account.organization_id',
        'organization.id'
      )
      .select(['organization.id', 'organization.name'])
      .orderBy('organization.name')
      .orderBy('organization.id')
      .execute();
  }

  async totals(): Promise<SchoolTotals> {
    const row = await this.db
      .selectFrom('school_account')
      .select([
        sql<string>`count(*)`.as('schools'),
        sql<string>`count(*) FILTER (WHERE suspended_at IS NULL)`.as('active'),
        sql<string>`(SELECT count(*) FROM student)`.as('students'),
      ])
      .executeTakeFirstOrThrow();
    return {
      schools: Number(row.schools),
      active: Number(row.active),
      students: Number(row.students),
    };
  }

  async findSchool(
    organizationId: string
  ): Promise<PlatformSchool | undefined> {
    const row = await this.selectSchools()
      .where('organization.id', '=', organizationId)
      .executeTakeFirst();
    const [school] = row ? await this.withOwners([row]) : [];
    return school;
  }

  private membersOf(organizationId: string) {
    return this.db
      .selectFrom('member')
      .innerJoin('user', 'user.id', 'member.userId')
      .select([
        'member.id as memberId',
        'user.id as userId',
        'user.name',
        'user.email',
        'member.role',
      ])
      .where('member.organizationId', '=', organizationId);
  }

  async listMembers(organizationId: string): Promise<PlatformSchoolMember[]> {
    const rows = await this.membersOf(organizationId)
      .orderBy('user.name')
      .orderBy('user.id')
      .execute();
    return rows.map((row) => toMember(row));
  }

  async findMember(
    organizationId: string,
    memberId: string
  ): Promise<PlatformSchoolMember | undefined> {
    const row = await this.membersOf(organizationId)
      .where('member.id', '=', memberId)
      .executeTakeFirst();
    if (!row) {
      return undefined;
    }
    return toMember(row);
  }

  async setSuspended(input: {
    organizationId: string;
    by: string | null;
    audit: PlatformAuditEntry;
  }): Promise<boolean> {
    return this.db.transaction().execute(async (trx) => {
      const suspending = input.by !== null;
      const result = await trx
        .updateTable('school_account')
        .set({
          suspended_at: suspending ? sql`now()` : null,
          suspended_by: input.by,
        })
        .where('organization_id', '=', input.organizationId)
        .where('suspended_at', suspending ? 'is' : 'is not', null)
        .executeTakeFirst();
      if (result.numUpdatedRows === 0n) {
        return false;
      }
      await insertPlatformAudit(trx, input.audit);
      return true;
    });
  }

  async replaceOwner(input: OwnerReplacement): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await this.makeOwner(trx, input);
      const others = await trx
        .selectFrom('member')
        .select(['id', 'userId'])
        .where('organizationId', '=', input.organizationId)
        .where('userId', '!=', input.newOwnerUserId)
        .where(sql<boolean>`'owner' = ANY(string_to_array(role, ','))`)
        .execute();
      for (const other of others) {
        await (input.previousOwner === 'member'
          ? trx
              .updateTable('member')
              .set({ role: MEMBER_ROLE })
              .where('id', '=', other.id)
              .execute()
          : this.removeMember(trx, input.organizationId, other));
      }
      await insertPlatformAudit(trx, input.audit);
    });
  }

  private async makeOwner(
    trx: Transaction<DB>,
    input: OwnerReplacement
  ): Promise<void> {
    const current = await trx
      .selectFrom('member')
      .select(['id', 'role'])
      .where('organizationId', '=', input.organizationId)
      .where('userId', '=', input.newOwnerUserId)
      .executeTakeFirst();
    if (current) {
      await trx
        .updateTable('member')
        .set({ role: ownerRoles(splitRoles(current.role)).join(',') })
        .where('id', '=', current.id)
        .execute();
      return;
    }
    await trx
      .insertInto('member')
      .values({
        organizationId: input.organizationId,
        userId: input.newOwnerUserId,
        role: OWNER_ROLE,
        createdAt: sql`now()`,
      })
      .execute();
  }

  private async removeMember(
    trx: Transaction<DB>,
    organizationId: string,
    member: { id: string; userId: string }
  ): Promise<void> {
    const removed = await trx
      .deleteFrom('teamMember')
      .where('userId', '=', member.userId)
      .where(
        'teamId',
        'in',
        trx
          .selectFrom('team')
          .select('id')
          .where('organizationId', '=', organizationId)
      )
      .returning('teamId')
      .execute();
    if (removed.length > 0) {
      await trx
        .updateTable('team')
        .set({ memberCount: sql`GREATEST("memberCount" - 1, 0)` })
        .where(
          'id',
          'in',
          removed.map((row) => row.teamId)
        )
        .execute();
    }
    await trx.deleteFrom('member').where('id', '=', member.id).execute();
  }

  async slugTaken(slug: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('organization')
      .select('id')
      .where('slug', '=', slug)
      .executeTakeFirst();
    return row !== undefined;
  }

  async insertSchoolAccount(input: NewSchoolAccountRow): Promise<void> {
    await this.db
      .insertInto('school_account')
      .values({
        organization_id: input.organizationId,
        name: input.name,
        city: input.city,
        admission_prefix: input.admissionPrefix,
        currency: input.currency,
      })
      .execute();
  }
}
