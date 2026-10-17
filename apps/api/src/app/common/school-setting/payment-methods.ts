import type { Kysely, Selectable } from 'kysely';
import type { PaymentMethods } from '@eduvault/api-contract';
import type { DB, SchoolSetting } from '../../../db/db-types';

type PaymentMethodColumns = Pick<
  Selectable<SchoolSetting>,
  'pay_cash' | 'pay_transfer' | 'pay_pos'
>;

export const paymentMethodsOf = (
  row: PaymentMethodColumns
): PaymentMethods => ({
  cash: row.pay_cash,
  transfer: row.pay_transfer,
  pos: row.pay_pos,
});

export async function readPaymentMethods(
  db: Kysely<DB>,
  organizationId: string
): Promise<PaymentMethods> {
  const row = await db
    .selectFrom('school_setting')
    .select(['pay_cash', 'pay_transfer', 'pay_pos'])
    .where('organization_id', '=', organizationId)
    .executeTakeFirstOrThrow();
  return paymentMethodsOf(row);
}
