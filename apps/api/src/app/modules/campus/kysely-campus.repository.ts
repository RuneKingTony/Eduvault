import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import type { Campus } from '@eduvault/api-contract';
import { splitRoles } from '@eduvault/policy';
import type { CampusScope } from '../../common/campus-scope';
import { inCampusScope } from '../../common/db/in-campus-scope';
import { iso } from '../../common/db/rows';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { placedNow } from '../../common/students';
import {
  CampusRepository,
  type CampusMemberRecord,
  type NewCampus,
} from './campus.repository';

interface Row {
  team_id: string;
  organization_id: string;
  address: string | null;
  created_at: Date | string;
  name: string;
}

const toCampus = (row: Row): Campus => ({
  id: row.team_id,
  organizationId: row.organization_id,
  name: row.name,
  address: row.address,
  createdAt: iso(row.created_at),
});

@Injectable()
export class KyselyCampusRepository extends CampusRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  private select(organizationId: string) {
    return this.db
      .selectFrom('campus')
      .innerJoin('team', 'team.id', 'campus.team_id')
      .where('campus.organization_id', '=', organizationId)
      .select([
        'campus.team_id',
        'campus.organization_id',
        'campus.address',
        'campus.created_at',
        'team.name',
      ]);
  }

  async list(organizationId: string, scope: CampusScope): Promise<Campus[]> {
    const rows = await this.select(organizationId)
      .where((eb) => inCampusScope(eb, 'campus.team_id', { scope }))
      .orderBy('team.name')
      .orderBy('campus.team_id')
      .execute();
    return rows.map((row) => toCampus(row));
  }

  async findById(
    organizationId: string,
    id: string
  ): Promise<Campus | undefined> {
    const row = await this.select(organizationId)
      .where('campus.team_id', '=', id)
      .executeTakeFirst();
    return row && toCampus(row);
  }

  async nameTaken(
    organizationId: string,
    name: string,
    exceptId?: string
  ): Promise<boolean> {
    const row = await this.select(organizationId)
      .where(sql<boolean>`lower(team.name) = lower(${name})`)
      .$if(exceptId !== undefined, (qb) =>
        qb.where('campus.team_id', '<>', exceptId ?? '')
      )
      .executeTakeFirst();
    return row !== undefined;
  }

  async membersOf(
    organizationId: string,
    campusIds: readonly string[]
  ): Promise<CampusMemberRecord[]> {
    if (campusIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .selectFrom('teamMember')
      .innerJoin('campus', 'campus.team_id', 'teamMember.teamId')
      .innerJoin('user', 'user.id', 'teamMember.userId')
      .innerJoin('member', (join) =>
        join
          .onRef('member.userId', '=', 'teamMember.userId')
          .onRef('member.organizationId', '=', 'campus.organization_id')
      )
      .where('campus.organization_id', '=', organizationId)
      .where('teamMember.teamId', 'in', [...campusIds])
      .select([
        'teamMember.teamId',
        'teamMember.userId',
        'user.name',
        'member.role',
      ])
      .orderBy('user.name')
      .orderBy('teamMember.userId')
      .execute();
    return rows.map((row) => ({
      campusId: row.teamId,
      userId: row.userId,
      name: row.name,
      roles: splitRoles(row.role),
    }));
  }

  async placedStudentCounts(
    organizationId: string,
    campusIds: readonly string[]
  ): Promise<Record<string, number>> {
    if (campusIds.length === 0) {
      return {};
    }
    const rows = await placedNow(this.db, organizationId)
      .where('ep.campus_id', 'in', [...campusIds])
      .select([
        'ep.campus_id',
        (eb) => eb.fn.count<string>('student.id').distinct().as('total'),
      ])
      .groupBy('ep.campus_id')
      .execute();
    return Object.fromEntries(
      rows.map((row) => [row.campus_id, Number(row.total)])
    );
  }

  async activeClassCounts(
    organizationId: string,
    campusIds: readonly string[]
  ): Promise<Record<string, number>> {
    if (campusIds.length === 0) {
      return {};
    }
    const rows = await this.db
      .selectFrom('class_arm')
      .where('organization_id', '=', organizationId)
      .where('campus_id', 'in', [...campusIds])
      .where('retired_at', 'is', null)
      .select(['campus_id', (eb) => eb.fn.countAll<string>().as('total')])
      .groupBy('campus_id')
      .execute();
    return Object.fromEntries(
      rows.map((row) => [row.campus_id, Number(row.total)])
    );
  }

  async existsInSchool(organizationId: string, id: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('campus')
      .select('team_id')
      .where('team_id', '=', id)
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();
    return row !== undefined;
  }

  async hasDependents(organizationId: string, id: string): Promise<boolean> {
    const [arm, student, placement, fee, announcement, account, line] =
      await Promise.all([
        this.db
          .selectFrom('class_arm')
          .select('id')
          .where('campus_id', '=', id)
          .where('organization_id', '=', organizationId)
          .executeTakeFirst(),
        this.db
          .selectFrom('student')
          .select('id')
          .where('campus_id', '=', id)
          .where('organization_id', '=', organizationId)
          .executeTakeFirst(),
        this.db
          .selectFrom('enrollment_placement')
          .select('id')
          .where('campus_id', '=', id)
          .where('organization_id', '=', organizationId)
          .executeTakeFirst(),
        this.db
          .selectFrom('fee_line')
          .select('id')
          .where('campus_id', '=', id)
          .where('organization_id', '=', organizationId)
          .executeTakeFirst(),
        this.db
          .selectFrom('announcement')
          .select('id')
          .where('campus_id', '=', id)
          .where('organization_id', '=', organizationId)
          .executeTakeFirst(),
        this.db
          .selectFrom('money_account')
          .select('id')
          .where('campus_id', '=', id)
          .where('organization_id', '=', organizationId)
          .executeTakeFirst(),
        this.db
          .selectFrom('journal_line')
          .select('id')
          .where('campus_id', '=', id)
          .where('organization_id', '=', organizationId)
          .limit(1)
          .executeTakeFirst(),
      ]);
    return (
      arm !== undefined ||
      student !== undefined ||
      placement !== undefined ||
      fee !== undefined ||
      announcement !== undefined ||
      account !== undefined ||
      line !== undefined ||
      (await this.hasCharges(organizationId, id))
    );
  }

  private async hasCharges(
    organizationId: string,
    id: string
  ): Promise<boolean> {
    const [invoice, round] = await Promise.all([
      this.db
        .selectFrom('invoice')
        .select('id')
        .where('campus_id', '=', id)
        .where('organization_id', '=', organizationId)
        .limit(1)
        .executeTakeFirst(),
      this.db
        .selectFrom('billing_run')
        .select('id')
        .where('scope_campus_id', '=', id)
        .where('organization_id', '=', organizationId)
        .limit(1)
        .executeTakeFirst(),
    ]);
    return invoice !== undefined || round !== undefined;
  }

  async create(organizationId: string, input: NewCampus): Promise<void> {
    await this.db
      .insertInto('campus')
      .values({
        team_id: input.id,
        organization_id: organizationId,
        address: input.address,
      })
      .execute();
  }

  async updateAddress(
    organizationId: string,
    id: string,
    address: string | null
  ): Promise<void> {
    await this.db
      .updateTable('campus')
      .set({ address, updated_at: new Date() })
      .where('team_id', '=', id)
      .where('organization_id', '=', organizationId)
      .execute();
  }
}
