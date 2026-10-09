import { Inject, Injectable } from '@nestjs/common';
import type { Campus } from '@eduvault/api-contract';
import type { CampusScope } from '../../common/campus-scope';
import { inCampusScope } from '../../common/db/in-campus-scope';
import { iso } from '../../common/db/rows';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { CampusRepository, type NewCampus } from './campus.repository';

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
    const [student, fee] = await Promise.all([
      this.db
        .selectFrom('student')
        .select('id')
        .where('campus_id', '=', id)
        .where('organization_id', '=', organizationId)
        .executeTakeFirst(),
      this.db
        .selectFrom('fee_schedule')
        .select('id')
        .where('campus_id', '=', id)
        .where('organization_id', '=', organizationId)
        .executeTakeFirst(),
    ]);
    return student !== undefined || fee !== undefined;
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
