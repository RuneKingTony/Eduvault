import { sql } from 'kysely';
import type { Database } from '../db/tokens';
import { nextChildCode } from './ledger-balance';

interface ChildAccountInput {
  organizationId: string;
  parentId: string;
  name: string;
}

interface ChildAccountRow {
  id: string;
  code: number;
  name: string;
  type: string;
  parent_id: string | null;
  system_key: string | null;
}

export async function insertChildAccount(
  trx: Database,
  input: ChildAccountInput
): Promise<
  { status: 'name_taken' } | { status: 'created'; row: ChildAccountRow }
> {
  const { organizationId, parentId, name } = input;
  const parent = await trx
    .selectFrom('ledger_account')
    .select(['code', 'type'])
    .where('organization_id', '=', organizationId)
    .where('id', '=', parentId)
    .executeTakeFirstOrThrow();
  const accounts = await trx
    .selectFrom('ledger_account')
    .select(['code', 'parent_id', sql<string>`lower(name)`.as('lowered')])
    .where('organization_id', '=', organizationId)
    .execute();
  const siblings = accounts.filter((row) => row.parent_id === parentId);
  if (siblings.some((row) => row.lowered === name.toLowerCase())) {
    return { status: 'name_taken' };
  }
  const row = await trx
    .insertInto('ledger_account')
    .values({
      organization_id: organizationId,
      code: nextChildCode(
        parent.code,
        siblings.map((sibling) => sibling.code),
        accounts.map((account) => account.code)
      ),
      name,
      type: parent.type,
      parent_id: parentId,
    })
    .returning(['id', 'code', 'name', 'type', 'parent_id', 'system_key'])
    .executeTakeFirstOrThrow();
  return { status: 'created', row };
}
