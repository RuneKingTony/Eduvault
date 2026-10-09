import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import type { PlatformSchool } from '@eduvault/api-contract';
import { iso } from '../../common/db/rows';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import {
  PlatformRepository,
  type NewSchoolAccountRow,
} from './platform.repository';

interface SchoolRow {
  id: string;
  name: string;
  slug: string;
  admission_prefix: string;
  city: string | null;
  createdAt: Date | string;
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
  createdAt: iso(row.createdAt),
});

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

  async listSchools(): Promise<PlatformSchool[]> {
    const rows = await this.selectSchools()
      .orderBy('organization.name')
      .orderBy('organization.id')
      .execute();
    return this.withOwners(rows);
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
