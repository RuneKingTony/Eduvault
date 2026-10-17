import type { Kysely, Selectable } from 'kysely';
import {
  APPROVAL_RULE_BY_KIND,
  type ApprovalKind,
  type ApprovalRules,
} from '@eduvault/api-contract';
import type { DB, SchoolSetting } from '../../../db/db-types';

type RuleColumns = Pick<
  Selectable<SchoolSetting>,
  | 'approve_refund'
  | 'approve_write_off'
  | 'approve_credit_note'
  | 'approve_discount'
  | 'approve_payment_void'
>;

export const RULE_COLUMNS = [
  'approve_refund',
  'approve_write_off',
  'approve_credit_note',
  'approve_discount',
  'approve_payment_void',
] as const satisfies readonly (keyof RuleColumns)[];

export const approvalRulesOf = (row: RuleColumns): ApprovalRules => ({
  refund: row.approve_refund,
  writeOff: row.approve_write_off,
  creditNote: row.approve_credit_note,
  discount: row.approve_discount,
  paymentVoid: row.approve_payment_void,
});

export const isRuleOn = (rules: ApprovalRules, kind: ApprovalKind): boolean =>
  rules[APPROVAL_RULE_BY_KIND[kind]];

/** Read once when a request is made: a switch changed later never touches a request already waiting. */
export async function isApprovalOn(
  db: Kysely<DB>,
  organizationId: string,
  kind: ApprovalKind
): Promise<boolean> {
  const row = await db
    .selectFrom('school_setting')
    .select(RULE_COLUMNS)
    .where('organization_id', '=', organizationId)
    .executeTakeFirst();
  return row === undefined ? true : isRuleOn(approvalRulesOf(row), kind);
}
