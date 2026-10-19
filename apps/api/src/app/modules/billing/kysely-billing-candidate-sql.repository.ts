import { sql, type RawBuilder } from 'kysely';
import { INACTIVE_AFTER_DAYS } from '@eduvault/shared';
import type { RoundFilter } from './billing-round';

// These fragments read the caller's aliases: s (student) and en (enrollment); roundFilterSql also reads p (placements).
export const termPlacementCampusSql = (
  termId: string
): RawBuilder<string | null> =>
  sql<string | null>`(
    select tp.campus_id
    from enrollment_placement tp
    where tp.enrollment_id = en.id
      and tp.term_id = ${termId}
  )`;

export const latestPlacementCampusSql = (): RawBuilder<string | null> =>
  sql<string | null>`(
    select ep.campus_id
    from enrollment_placement ep
    join term t on t.id = ep.term_id and t.organization_id = ep.organization_id
    where ep.enrollment_id = en.id
    order by t.sequence desc
    limit 1
  )`;

const campusOfSql = (
  termPlacement: RawBuilder<string | null>,
  latestPlacement: RawBuilder<string | null>
) => sql<string>`coalesce(${termPlacement}, ${latestPlacement}, s.campus_id)`;

const termCampusSql = (termId: string) =>
  campusOfSql(termPlacementCampusSql(termId), latestPlacementCampusSql());

export const includedSql = (today: string): RawBuilder<boolean> =>
  sql<boolean>`(
    en.status = 'active'
    and s.exit_kind is null
    and (
      s.not_seen_since is null
      or ${today}::date - s.not_seen_since < ${INACTIVE_AFTER_DAYS}
    )
  )`;

export const chargedSql = (termId: string): RawBuilder<boolean> =>
  sql<boolean>`exists (
    select 1
    from invoice i
    where i.student_id = s.id
      and i.organization_id = s.organization_id
      and i.term_id = ${termId}
      and i.kind = 'term'
      and i.status <> 'cancelled'
  )`;

export const roundFilterSql = (filter: RoundFilter): RawBuilder<unknown> => {
  switch (filter.scope) {
    case 'school': {
      return sql`true`;
    }
    case 'campus': {
      return sql`${campusOfSql(
        sql`p.term_campus_id`,
        sql`p.latest_campus_id`
      )} = ${filter.campusId}`;
    }
    case 'level': {
      return sql`en.class_level_id = ${filter.classLevelId}`;
    }
  }
};

export const hasLineSql = (termId: string): RawBuilder<boolean> =>
  sql<boolean>`exists (
    select 1
    from fee_line f
    join ledger_account fee_type
      on fee_type.id = f.ledger_account_id
      and fee_type.organization_id = f.organization_id
    where f.organization_id = s.organization_id
      and f.term_id = ${termId}
      and f.retired_at is null
      and f.class_level_id = en.class_level_id
      and (f.campus_id is null or f.campus_id = ${termCampusSql(termId)})
      and (f.applies_to = 'all' or (f.applies_to = 'new') = en.is_new_student)
      and (
        not f.is_optional
        or exists (
          select 1
          from student_fee_option o
          where o.enrollment_id = en.id
            and o.ledger_account_id = f.ledger_account_id
            and o.organization_id = f.organization_id
        )
      )
  )`;
