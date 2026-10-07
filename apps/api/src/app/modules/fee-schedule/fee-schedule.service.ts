import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { FeeSchedule } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { assertCampusInSchool } from '../../common/campus-guard';
import { canSeeCampus } from '../../common/campus-scope';
import { KYSELY_TOKEN, type Database } from '../../common/db/database.module';
import { iso } from '../../common/rows';

interface FeeInput {
  campusId?: string | null | undefined;
  name: string;
  amountMinor: number;
  currency: string;
}

type Row = {
  id: string;
  organization_id: string;
  campus_id: string | null;
  name: string;
  amount_minor: string | number | bigint;
  currency: string;
  created_at: Date | string;
};

@Injectable()
export class FeeScheduleService {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {}

  private toFee(row: Row): FeeSchedule {
    return {
      id: row.id,
      organizationId: row.organization_id,
      campusId: row.campus_id,
      name: row.name,
      amountMinor: Number(row.amount_minor),
      currency: row.currency,
      createdAt: iso(row.created_at),
    };
  }

  /** A null campus applies to every campus, so every member of the school sees it. */
  private visible(ctx: OrgContext, row: { campus_id: string | null }) {
    return (
      row.campus_id === null || canSeeCampus(ctx.campusScope, row.campus_id)
    );
  }

  async list(ctx: OrgContext, campusId?: string): Promise<FeeSchedule[]> {
    if (campusId && !canSeeCampus(ctx.campusScope, campusId)) {
      throw new NotFoundException('Campus not found');
    }
    let query = this.db
      .selectFrom('fee_schedule')
      .selectAll()
      .where('organization_id', '=', ctx.organizationId);
    if (campusId) {
      query = query.where((eb) =>
        eb.or([eb('campus_id', '=', campusId), eb('campus_id', 'is', null)])
      );
    }
    const rows = await query.orderBy('name').orderBy('id').execute();
    return rows
      .filter((row) => this.visible(ctx, row))
      .map((r) => this.toFee(r));
  }

  async get(ctx: OrgContext, id: string): Promise<FeeSchedule> {
    const row = await this.db
      .selectFrom('fee_schedule')
      .selectAll()
      .where('id', '=', id)
      .where('organization_id', '=', ctx.organizationId)
      .executeTakeFirst();
    if (!row || !this.visible(ctx, row)) {
      throw new NotFoundException('Fee schedule not found');
    }
    return this.toFee(row);
  }

  async create(ctx: OrgContext, input: FeeInput): Promise<FeeSchedule> {
    if (input.campusId) {
      await assertCampusInSchool(this.db, ctx.organizationId, input.campusId);
    }
    const row = await this.db
      .insertInto('fee_schedule')
      .values({
        organization_id: ctx.organizationId,
        campus_id: input.campusId ?? null,
        name: input.name,
        amount_minor: String(input.amountMinor),
        currency: input.currency,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.toFee(row);
  }

  async update(
    ctx: OrgContext,
    id: string,
    input: Partial<FeeInput>
  ): Promise<FeeSchedule> {
    await this.get(ctx, id);
    if (input.campusId) {
      await assertCampusInSchool(this.db, ctx.organizationId, input.campusId);
    }
    const row = await this.db
      .updateTable('fee_schedule')
      .set({
        ...(input.campusId !== undefined && { campus_id: input.campusId }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.amountMinor !== undefined && {
          amount_minor: String(input.amountMinor),
        }),
        ...(input.currency !== undefined && { currency: input.currency }),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('organization_id', '=', ctx.organizationId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.toFee(row);
  }

  async remove(ctx: OrgContext, id: string): Promise<{ id: string }> {
    await this.get(ctx, id);
    await this.db
      .deleteFrom('fee_schedule')
      .where('id', '=', id)
      .where('organization_id', '=', ctx.organizationId)
      .execute();
    return { id };
  }
}
