import { NotFoundException } from '@nestjs/common';
import type { Database } from './db/database.module';

/** 404 unless the campus exists in the given school. */
export async function assertCampusInSchool(
  db: Database,
  organizationId: string,
  campusId: string
): Promise<void> {
  const campus = await db
    .selectFrom('campus')
    .select('team_id')
    .where('team_id', '=', campusId)
    .where('organization_id', '=', organizationId)
    .executeTakeFirst();
  if (!campus) throw new NotFoundException('Campus not found');
}
