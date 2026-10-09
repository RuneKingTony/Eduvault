import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { READ_METHODS, type AuditRow } from '@eduvault/api-contract';
import type { DB } from '../../../db/db-types';
import { iso } from '../db/rows';
import { KYSELY_TOKEN, type Database } from '../db/tokens';
import {
  AuditRepository,
  type ActingAuditEntry,
  type AuditAction,
  type AuditFilter,
  type AuditKind,
  type AuditPage,
  type PlatformAuditEntry,
} from './audit.repository';

interface AuditSelectRow {
  id: string;
  kind: string;
  actorId: string;
  actorName: string;
  schoolId: string | null;
  schoolName: string | null;
  method: string | null;
  action: string | null;
  path: string;
  status: number;
  reason: string | null;
  created_at: Date | string;
  createdKey: string;
}

const toAuditRow = (row: AuditSelectRow): AuditRow => ({
  id: row.id,
  kind: row.kind as AuditKind,
  actor: { id: row.actorId, name: row.actorName },
  school:
    row.schoolId === null || row.schoolName === null
      ? null
      : { id: row.schoolId, name: row.schoolName },
  method: row.method,
  action: row.action as AuditAction | null,
  path: row.path,
  status: row.status,
  reason: row.reason,
  createdAt: iso(row.created_at),
});

export async function insertPlatformAudit(
  db: Kysely<DB>,
  entry: PlatformAuditEntry
): Promise<void> {
  await db
    .insertInto('audit_log')
    .values({
      kind: 'platform',
      actor_user_id: entry.actorUserId,
      organization_id: entry.organizationId,
      action: entry.action,
      path: entry.path,
      status: entry.status,
    })
    .execute();
}

@Injectable()
export class KyselyAuditRepository extends AuditRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  async recordActing(entry: ActingAuditEntry): Promise<void> {
    await this.db
      .insertInto('audit_log')
      .values({
        kind: 'acting',
        actor_user_id: entry.actorUserId,
        organization_id: entry.organizationId,
        method: entry.method,
        path: entry.path,
        status: entry.status,
        reason: entry.reason,
      })
      .execute();
  }

  recordPlatform(entry: PlatformAuditEntry): Promise<void> {
    return insertPlatformAudit(this.db, entry);
  }

  async list(filter: AuditFilter): Promise<AuditPage> {
    let query = this.db
      .selectFrom('audit_log')
      .innerJoin('user', 'user.id', 'audit_log.actor_user_id')
      .leftJoin('organization', 'organization.id', 'audit_log.organization_id')
      .select([
        'audit_log.id',
        'audit_log.kind',
        'audit_log.method',
        'audit_log.action',
        'audit_log.path',
        'audit_log.status',
        'audit_log.reason',
        'audit_log.created_at',
        'audit_log.organization_id as schoolId',
        'organization.name as schoolName',
        'user.id as actorId',
        'user.name as actorName',
        sql<string>`to_char(audit_log.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
          'createdKey'
        ),
      ]);
    if (filter.schoolId !== undefined) {
      query = query.where('audit_log.organization_id', '=', filter.schoolId);
    }
    if (filter.kind !== undefined) {
      query = query.where('audit_log.kind', '=', filter.kind);
    }
    if (filter.writesOnly) {
      query = query.where((eb) =>
        eb.or([
          eb('audit_log.kind', '=', 'platform'),
          eb('audit_log.method', 'not in', [...READ_METHODS]),
        ])
      );
    }
    if (filter.after !== undefined) {
      const { createdAt, id } = filter.after;
      query = query.where(
        sql<boolean>`(audit_log.created_at, audit_log.id) < (${createdAt}::timestamptz, ${id}::uuid)`
      );
    }
    const rows = await query
      .orderBy('audit_log.created_at', 'desc')
      .orderBy('audit_log.id', 'desc')
      .limit(filter.limit + 1)
      .execute();
    const kept = rows.slice(0, filter.limit);
    const last = kept.at(-1);
    return {
      items: kept.map((row) => toAuditRow(row as AuditSelectRow)),
      next:
        rows.length > filter.limit && last !== undefined
          ? { createdAt: (last as AuditSelectRow).createdKey, id: last.id }
          : undefined,
    };
  }

  async countActing(): Promise<number> {
    const row = await this.db
      .selectFrom('audit_log')
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .where('kind', '=', 'acting')
      .executeTakeFirstOrThrow();
    return Number(row.total);
  }
}
