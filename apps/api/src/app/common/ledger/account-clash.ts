import { uniqueViolation } from '../db/unique-violation';

const NAME_TAKEN = 'ledger_account_sibling_name_key';
const CODE_TAKEN = 'ledger_account_organization_id_code_key';

export type AccountClash = { status: 'name_taken' } | { status: 'code_taken' };

export const accountClash = (error: unknown): AccountClash | undefined => {
  const constraint = uniqueViolation(error);
  if (constraint === NAME_TAKEN) {
    return { status: 'name_taken' };
  }
  return constraint === CODE_TAKEN ? { status: 'code_taken' } : undefined;
};
