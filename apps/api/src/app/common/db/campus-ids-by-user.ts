import type { Database } from './tokens';

export async function campusIdsByUser(
  db: Database,
  organizationId: string,
  userIds?: readonly string[]
): Promise<Map<string, string[]>> {
  const byUser = new Map<string, string[]>();
  if (userIds?.length === 0) {
    return byUser;
  }
  const rows = await db
    .selectFrom('teamMember')
    .innerJoin('campus', 'campus.team_id', 'teamMember.teamId')
    .innerJoin('team', 'team.id', 'teamMember.teamId')
    .where('campus.organization_id', '=', organizationId)
    .$if(userIds !== undefined, (qb) =>
      qb.where('teamMember.userId', 'in', [...(userIds ?? [])])
    )
    .select(['teamMember.userId', 'teamMember.teamId'])
    .orderBy('team.name')
    .orderBy('team.id')
    .execute();
  for (const row of rows) {
    byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row.teamId]);
  }
  return byUser;
}
