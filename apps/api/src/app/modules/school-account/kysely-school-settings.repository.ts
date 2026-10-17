import { Inject, Injectable } from '@nestjs/common';
import type { Selectable } from 'kysely';
import type { PaymentMethods, SchoolSettings } from '@eduvault/api-contract';
import type { SchoolSetting } from '../../../db/db-types';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { paymentMethodsOf } from '../../common/school-setting/payment-methods';
import {
  SchoolSettingsRepository,
  type PaymentMethodsOutcome,
  type SchoolSettingsPatch,
} from './school-settings.repository';

const COLUMNS = [
  'max_guardians',
  'require_guardian',
  'pay_cash',
  'pay_transfer',
  'pay_pos',
  'receipt_footer',
] as const;

type SettingsRow = Pick<Selectable<SchoolSetting>, (typeof COLUMNS)[number]>;

const toSettings = (row: SettingsRow): SchoolSettings => ({
  maxGuardians: row.max_guardians,
  requireGuardian: row.require_guardian,
  paymentMethods: paymentMethodsOf(row),
  receiptFooter: row.receipt_footer,
});

async function mergeMethods(
  trx: Database,
  who: { organizationId: string; updatedBy: string },
  change: { current: SettingsRow; patch: Partial<PaymentMethods> }
): Promise<PaymentMethodsOutcome> {
  const merged: PaymentMethods = {
    ...paymentMethodsOf(change.current),
    ...change.patch,
  };
  if (!merged.cash && !merged.transfer && !merged.pos) {
    return { status: 'none_left' };
  }
  await trx
    .updateTable('school_setting')
    .set({
      pay_cash: merged.cash,
      pay_transfer: merged.transfer,
      pay_pos: merged.pos,
      updated_by: who.updatedBy,
      updated_at: new Date(),
    })
    .where('organization_id', '=', who.organizationId)
    .execute();
  return { status: 'saved', methods: merged };
}

@Injectable()
export class KyselySchoolSettingsRepository extends SchoolSettingsRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  async find(organizationId: string): Promise<SchoolSettings | undefined> {
    const row = await this.db
      .selectFrom('school_setting')
      .select(COLUMNS)
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();
    return row && toSettings(row);
  }

  async update(
    organizationId: string,
    patch: SchoolSettingsPatch,
    updatedBy: string
  ): Promise<SchoolSettings | undefined> {
    const row = await this.db
      .updateTable('school_setting')
      .set({
        ...(patch.maxGuardians === undefined
          ? {}
          : { max_guardians: patch.maxGuardians }),
        ...(patch.requireGuardian === undefined
          ? {}
          : { require_guardian: patch.requireGuardian }),
        ...(patch.receiptFooter === undefined
          ? {}
          : { receipt_footer: patch.receiptFooter }),
        updated_by: updatedBy,
        updated_at: new Date(),
      })
      .where('organization_id', '=', organizationId)
      .returning(COLUMNS)
      .executeTakeFirst();
    return row && toSettings(row);
  }

  updatePaymentMethods(
    organizationId: string,
    patch: Partial<PaymentMethods>,
    updatedBy: string
  ): Promise<PaymentMethodsOutcome | undefined> {
    return this.db.transaction().execute(async (trx) => {
      const current = await trx
        .selectFrom('school_setting')
        .select(COLUMNS)
        .where('organization_id', '=', organizationId)
        .forUpdate()
        .executeTakeFirst();
      return current === undefined
        ? current
        : mergeMethods(trx, { organizationId, updatedBy }, { current, patch });
    });
  }
}
