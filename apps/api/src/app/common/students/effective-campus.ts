import { sql, type RawBuilder } from 'kysely';

/** A student is on the campus of their placement in the current term, or on their home campus without one. */
export const effectiveCampusSql = (
  placementCampusId: RawBuilder<unknown>,
  homeCampusId: RawBuilder<unknown>
): RawBuilder<string> =>
  sql<string>`coalesce(${placementCampusId}, ${homeCampusId})`;
