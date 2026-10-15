import { ConflictException } from '@nestjs/common';
import { LEDGER_CODE_TAKEN_MESSAGE } from '@eduvault/api-contract';
import { uniqueViolation } from '../db/unique-violation';
import type { Database } from '../db/tokens';

const NAME_TAKEN = 'ledger_account_sibling_name_key';
const CODE_TAKEN = 'ledger_account_organization_id_code_key';

type AccountClash = { status: 'name_taken' } | { status: 'code_taken' };

const accountClash = (error: unknown): AccountClash | undefined => {
  const constraint = uniqueViolation(error);
  if (constraint === NAME_TAKEN) {
    return { status: 'name_taken' };
  }
  return constraint === CODE_TAKEN ? { status: 'code_taken' } : undefined;
};

export async function transactAccounts<T>(
  db: Database,
  work: (trx: Database) => Promise<T>
): Promise<T | AccountClash> {
  try {
    return await db.transaction().execute(work);
  } catch (error) {
    const clash = accountClash(error);
    if (clash === undefined) {
      throw error;
    }
    return clash;
  }
}

export const accountConflict = (
  status: AccountClash['status'],
  duplicateMessage: string
): ConflictException =>
  new ConflictException(
    status === 'name_taken' ? duplicateMessage : LEDGER_CODE_TAKEN_MESSAGE
  );
