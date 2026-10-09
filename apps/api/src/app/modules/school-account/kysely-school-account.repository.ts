import { Inject, Injectable } from '@nestjs/common';
import type { SchoolAccount } from '@eduvault/api-contract';
import { iso } from '../../common/db/rows';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import {
  SchoolAccountRepository,
  type NewSchoolAccount,
  type SchoolAccountPatch,
} from './school-account.repository';

interface Row {
  id: string;
  organization_id: string;
  name: string;
  currency: string;
  admission_prefix: string;
  city: string | null;
  created_at: Date | string;
}

const toAccount = (row: Row): SchoolAccount => ({
  id: row.id,
  organizationId: row.organization_id,
  name: row.name,
  currency: row.currency,
  admissionPrefix: row.admission_prefix,
  city: row.city,
  createdAt: iso(row.created_at),
});

@Injectable()
export class KyselySchoolAccountRepository extends SchoolAccountRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  async find(organizationId: string): Promise<SchoolAccount | undefined> {
    const row = await this.db
      .selectFrom('school_account')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();
    return row && toAccount(row);
  }

  async create(
    organizationId: string,
    input: NewSchoolAccount
  ): Promise<SchoolAccount> {
    const row = await this.db
      .insertInto('school_account')
      .values({
        organization_id: organizationId,
        name: input.name,
        currency: input.currency,
        admission_prefix: input.admissionPrefix,
        city: input.city ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toAccount(row);
  }

  async update(
    organizationId: string,
    patch: SchoolAccountPatch
  ): Promise<SchoolAccount | undefined> {
    const row = await this.db
      .updateTable('school_account')
      .set({
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.currency === undefined ? {} : { currency: patch.currency }),
        ...(patch.admissionPrefix === undefined
          ? {}
          : { admission_prefix: patch.admissionPrefix }),
        ...(patch.city === undefined ? {} : { city: patch.city }),
        updated_at: new Date(),
      })
      .where('organization_id', '=', organizationId)
      .returningAll()
      .executeTakeFirst();
    return row && toAccount(row);
  }

  async remove(organizationId: string): Promise<string | undefined> {
    const row = await this.db
      .deleteFrom('school_account')
      .where('organization_id', '=', organizationId)
      .returning('id')
      .executeTakeFirst();
    return row?.id;
  }
}
