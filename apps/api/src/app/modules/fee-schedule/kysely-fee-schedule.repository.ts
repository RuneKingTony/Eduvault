import { Inject, Injectable } from '@nestjs/common';
import type { FeeSchedule } from '@eduvault/api-contract';
import { iso } from '../../common/db/rows';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import {
  FeeScheduleRepository,
  type FeeSchedulePatch,
  type NewFeeSchedule,
} from './fee-schedule.repository';

interface Row {
  id: string;
  organization_id: string;
  campus_id: string | null;
  name: string;
  amount_minor: string | number | bigint;
  currency: string;
  created_at: Date | string;
}

const toFee = (row: Row): FeeSchedule => ({
  id: row.id,
  organizationId: row.organization_id,
  campusId: row.campus_id,
  name: row.name,
  amountMinor: Number(row.amount_minor),
  currency: row.currency,
  createdAt: iso(row.created_at),
});

@Injectable()
export class KyselyFeeScheduleRepository extends FeeScheduleRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  async list(
    organizationId: string,
    campusId?: string
  ): Promise<FeeSchedule[]> {
    let query = this.db
      .selectFrom('fee_schedule')
      .selectAll()
      .where('organization_id', '=', organizationId);
    if (campusId) {
      query = query.where((eb) =>
        eb.or([eb('campus_id', '=', campusId), eb('campus_id', 'is', null)])
      );
    }
    const rows = await query.orderBy('name').orderBy('id').execute();
    return rows.map(toFee);
  }

  async findById(
    organizationId: string,
    id: string
  ): Promise<FeeSchedule | undefined> {
    const row = await this.db
      .selectFrom('fee_schedule')
      .selectAll()
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();
    return row && toFee(row);
  }

  async create(
    organizationId: string,
    input: NewFeeSchedule
  ): Promise<FeeSchedule> {
    const row = await this.db
      .insertInto('fee_schedule')
      .values({
        organization_id: organizationId,
        campus_id: input.campusId ?? null,
        name: input.name,
        amount_minor: String(input.amountMinor),
        currency: input.currency,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toFee(row);
  }

  async update(
    organizationId: string,
    id: string,
    patch: FeeSchedulePatch
  ): Promise<FeeSchedule | undefined> {
    const row = await this.db
      .updateTable('fee_schedule')
      .set({
        ...(patch.campusId !== undefined && { campus_id: patch.campusId }),
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.amountMinor !== undefined && {
          amount_minor: String(patch.amountMinor),
        }),
        ...(patch.currency !== undefined && { currency: patch.currency }),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .returningAll()
      .executeTakeFirst();
    return row && toFee(row);
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.db
      .deleteFrom('fee_schedule')
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .execute();
  }
}
