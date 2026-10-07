import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { SchoolAccount } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { KYSELY_TOKEN, type Database } from '../../common/db/database.module';
import { iso } from '../../common/rows';

interface AccountInput {
  name: string;
  currency: string;
}

@Injectable()
export class SchoolAccountService {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {}

  private toAccount(row: {
    id: string;
    organization_id: string;
    name: string;
    currency: string;
    created_at: Date | string;
  }): SchoolAccount {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      currency: row.currency,
      createdAt: iso(row.created_at),
    };
  }

  async get(ctx: OrgContext): Promise<SchoolAccount> {
    const row = await this.db
      .selectFrom('school_account')
      .selectAll()
      .where('organization_id', '=', ctx.organizationId)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('School account not found');
    return this.toAccount(row);
  }

  async create(ctx: OrgContext, input: AccountInput): Promise<SchoolAccount> {
    const row = await this.db
      .insertInto('school_account')
      .values({ ...input, organization_id: ctx.organizationId })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.toAccount(row);
  }

  async update(
    ctx: OrgContext,
    input: Partial<AccountInput>
  ): Promise<SchoolAccount> {
    const row = await this.db
      .updateTable('school_account')
      .set({ ...input, updated_at: new Date() })
      .where('organization_id', '=', ctx.organizationId)
      .returningAll()
      .executeTakeFirst();
    if (!row) throw new NotFoundException('School account not found');
    return this.toAccount(row);
  }

  async remove(ctx: OrgContext): Promise<{ id: string }> {
    const row = await this.db
      .deleteFrom('school_account')
      .where('organization_id', '=', ctx.organizationId)
      .returning('id')
      .executeTakeFirst();
    if (!row) throw new NotFoundException('School account not found');
    return { id: row.id };
  }
}
