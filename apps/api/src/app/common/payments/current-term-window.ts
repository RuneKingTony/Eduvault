import { sql, type RawBuilder } from 'kysely';

/** Payments can arrive before the term starts, so the window opens at the earliest issued invoice entry when that is sooner. */
export function currentTermWindowCte(
  organizationId: string
): RawBuilder<unknown> {
  return sql`
    term_window AS MATERIALIZED (
      SELECT
        t.id AS term_id,
        t.ends_on,
        LEAST(t.starts_on, COALESCE((
          SELECT min(je.effective_on)
          FROM invoice i
          JOIN journal_entry je ON je.id = i.journal_entry_id AND je.organization_id = i.organization_id
          WHERE i.organization_id = ${organizationId}
            AND i.term_id = t.id AND i.status = 'issued'
            AND i.kind <> 'store'
        ), t.starts_on)) AS since_day
      FROM term t
      WHERE t.organization_id = ${organizationId} AND t.is_current
      LIMIT 1
    )`;
}

export function termPaymentPredicate(
  since: RawBuilder<unknown>,
  endsOn: RawBuilder<unknown>
): RawBuilder<boolean> {
  return sql<boolean>`
    p.status <> 'voided'
    AND NOT EXISTS (
      SELECT 1 FROM store_sale ss
      WHERE ss.payment_id = p.id AND ss.organization_id = p.organization_id
    )
    AND p.paid_on >= ${since}
    AND p.paid_on <= ${endsOn}`;
}
