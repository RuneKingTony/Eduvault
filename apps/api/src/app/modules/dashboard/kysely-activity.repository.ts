import { Inject, Injectable } from '@nestjs/common';
import { sql, type RawBuilder } from 'kysely';
import {
  ACTIVITY_PAGE_SIZE,
  type ActivityItem,
  type ActivityPage,
  type ActivityPillarName,
  type Scope,
} from '@eduvault/api-contract';
import { iso } from '../../common/db/rows';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { inScope, visibleStudentsCte } from '../../common/students';
import type { ActivityAccess } from './activity-access';
import { ActivityRepository } from './activity.repository';
import type { DashboardScope } from './dashboard.repository';

interface ActivityRow {
  total: number;
  id: string | null;
  occurred_at: Date | null;
  pillar: ActivityPillarName | null;
  text: string | null;
}

const campusPredicate = (scope: Scope): RawBuilder<boolean> =>
  scope === 'all'
    ? sql<boolean>`TRUE`
    : sql<boolean>`(
        (e.campus_id IS NULL AND e.pillar <> 'access')
        OR ${inScope(sql`e.campus_id`, scope)}
      )`;

const rowAccess = (access: ActivityAccess): RawBuilder<boolean> => {
  const pillars = sql.join(
    access.pillars
      .filter((pillar) => pillar !== 'foundation')
      .map((pillar) => sql`${pillar}`)
  );
  const parts = [sql<boolean>`e.pillar IN (${pillars})`];
  if (access.foundationSubjects.includes('school_year')) {
    parts.push(
      sql<boolean>`(e.pillar = 'foundation' AND e.subject_type = 'school_year')`
    );
  }
  if (access.foundationSubjects.includes('student')) {
    parts.push(sql<boolean>`(
      e.pillar = 'foundation'
      AND e.subject_type = 'student'
      AND EXISTS (SELECT 1 FROM visible v WHERE v.id::text = e.subject_id)
    )`);
  }
  const either = sql.join(parts, sql.raw(' OR '));
  return sql<boolean>`(${either})`;
};

const toItem = (row: ActivityRow): ActivityItem[] =>
  row.id === null ||
  row.occurred_at === null ||
  row.pillar === null ||
  row.text === null
    ? []
    : [
        {
          id: row.id,
          occurredAt: iso(row.occurred_at),
          pillar: row.pillar,
          text: row.text,
        },
      ];

@Injectable()
export class KyselyActivityRepository extends ActivityRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  async list(
    scope: DashboardScope,
    access: ActivityAccess,
    page: number
  ): Promise<ActivityPage> {
    const offset = (page - 1) * ACTIVITY_PAGE_SIZE;
    const { rows } = await sql<ActivityRow>`
      WITH ${visibleStudentsCte(scope)},
      allowed AS (
        SELECT e.id, e.occurred_at, e.pillar, e.text
        FROM activity_event e
        WHERE e.organization_id = ${scope.organizationId}
          AND ${campusPredicate(scope.campusScope)}
          AND ${rowAccess(access)}
      )
      SELECT counted.total, picked.id, picked.occurred_at, picked.pillar, picked.text
      FROM (SELECT count(*)::int AS total FROM allowed) counted
      LEFT JOIN LATERAL (
        SELECT * FROM allowed
        ORDER BY occurred_at DESC, id DESC
        LIMIT ${ACTIVITY_PAGE_SIZE} OFFSET ${offset}
      ) picked ON TRUE
      ORDER BY picked.occurred_at DESC NULLS LAST, picked.id DESC`.execute(
      this.db
    );
    return {
      items: rows.flatMap((row) => toItem(row)),
      total: rows[0]?.total ?? 0,
    };
  }
}
