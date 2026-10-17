import type { Database } from './tokens';

export async function currentSessionId(
  db: Database,
  organizationId: string
): Promise<string | undefined> {
  const row = await db
    .selectFrom('term')
    .where('organization_id', '=', organizationId)
    .where('is_current', '=', true)
    .select('session_id')
    .executeTakeFirst();
  return row?.session_id;
}
