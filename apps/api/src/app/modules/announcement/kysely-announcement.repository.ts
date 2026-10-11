import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import {
  announcementStatusSchema,
  announcementTagSchema,
  type Announcement,
  type AnnouncementCounts,
  type AnnouncementList,
  type AnnouncementListQuery,
  type AnnouncementSummary,
} from '@eduvault/api-contract';
import { ActivityWriter, type ActivityInput } from '../../common/activity';
import { inCampusScope } from '../../common/db/in-campus-scope';
import { iso } from '../../common/db/rows';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import {
  AnnouncementRepository,
  type AnnouncementChange,
  type AnnouncementScope,
  type AnnouncementTarget,
  type AnnouncementWrite,
} from './announcement.repository';

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  tag: string;
  campus_id: string | null;
  campus_name: string | null;
  status: string;
  pinned: boolean;
  published_on: string | null;
  withdrawn_at: Date | null;
  created_by: string;
  author_name: string;
  updated_by: string | null;
  editor_name: string | null;
  updated_at: Date;
}

const day = (column: string) =>
  sql<string | null>`to_char(${sql.ref(column)}, 'YYYY-MM-DD')`;

const toAnnouncement = (row: AnnouncementRow): Announcement => ({
  id: row.id,
  title: row.title,
  body: row.body,
  tag: announcementTagSchema.parse(row.tag),
  campusId: row.campus_id,
  campusName: row.campus_name,
  status: announcementStatusSchema.parse(row.status),
  pinned: row.pinned,
  publishedOn: row.published_on,
  withdrawnAt: row.withdrawn_at === null ? null : iso(row.withdrawn_at),
  createdBy: { id: row.created_by, name: row.author_name },
  updatedBy:
    row.updated_by === null || row.editor_name === null
      ? null
      : { id: row.updated_by, name: row.editor_name },
  updatedAt: iso(row.updated_at),
});

const EVERYTHING = { campusScope: 'all' } as const;

const datedBy = sql`CASE announcement.status
  WHEN 'published' THEN announcement.published_on::timestamptz
  WHEN 'withdrawn' THEN announcement.withdrawn_at
  ELSE announcement.updated_at
END`;

@Injectable()
export class KyselyAnnouncementRepository extends AnnouncementRepository {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly activity: ActivityWriter
  ) {
    super();
  }

  private visible(db: Database, scope: AnnouncementScope) {
    return db
      .selectFrom('announcement')
      .where('announcement.organization_id', '=', scope.organizationId)
      .where((eb) =>
        inCampusScope(eb, 'announcement.campus_id', {
          scope: scope.campusScope,
          nullMeans: 'all',
        })
      );
  }

  private withPeople(db: Database, scope: AnnouncementScope) {
    return this.visible(db, scope)
      .innerJoin('user as author', 'author.id', 'announcement.created_by')
      .leftJoin('user as editor', 'editor.id', 'announcement.updated_by')
      .leftJoin('team', 'team.id', 'announcement.campus_id')
      .select([
        'announcement.id',
        'announcement.title',
        'announcement.body',
        'announcement.tag',
        'announcement.campus_id',
        'announcement.status',
        'announcement.pinned',
        'announcement.withdrawn_at',
        'announcement.created_by',
        'announcement.updated_by',
        'announcement.updated_at',
        'team.name as campus_name',
        'author.name as author_name',
        'editor.name as editor_name',
        day('announcement.published_on').as('published_on'),
      ]);
  }

  private async counts(scope: AnnouncementScope): Promise<AnnouncementCounts> {
    const rows = await this.visible(this.db, scope)
      .select(['announcement.status', sql<number>`count(*)::int`.as('total')])
      .groupBy('announcement.status')
      .execute();
    const of = (status: string) =>
      rows.find((row) => row.status === status)?.total ?? 0;
    return {
      published: of('published'),
      draft: of('draft'),
      withdrawn: of('withdrawn'),
    };
  }

  async list(
    scope: AnnouncementScope,
    query: AnnouncementListQuery
  ): Promise<AnnouncementList> {
    const { status } = query;
    let items = this.withPeople(this.db, scope);
    if (status !== undefined) {
      items = items.where('announcement.status', '=', status);
    }
    const [rows, counts] = await Promise.all([
      items
        .orderBy(
          sql`(announcement.status = 'published' AND announcement.pinned)`,
          'desc'
        )
        .orderBy(datedBy, 'desc')
        .orderBy('announcement.created_at', 'desc')
        .orderBy('announcement.id')
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize)
        .execute(),
      this.counts(scope),
    ]);
    return {
      items: rows.map((row) => toAnnouncement(row)),
      total:
        status === undefined
          ? counts.published + counts.draft + counts.withdrawn
          : counts[status],
      counts,
    };
  }

  async findById(
    scope: AnnouncementScope,
    id: string
  ): Promise<Announcement | undefined> {
    const row = await this.withPeople(this.db, scope)
      .where('announcement.id', '=', id)
      .executeTakeFirst();
    return row && toAnnouncement(row);
  }

  async feed(
    scope: AnnouncementScope,
    limit: number
  ): Promise<AnnouncementSummary[]> {
    const rows = await this.visible(this.db, scope)
      .where('announcement.status', '=', 'published')
      .select([
        'announcement.id',
        'announcement.title',
        'announcement.body',
        'announcement.tag',
        'announcement.pinned',
        day('announcement.published_on').as('published_on'),
      ])
      .orderBy('announcement.pinned', 'desc')
      .orderBy('announcement.published_on', 'desc')
      .orderBy('announcement.updated_at', 'desc')
      .orderBy('announcement.id')
      .limit(limit)
      .execute();
    return rows.flatMap((row) =>
      row.published_on === null
        ? []
        : [
            {
              id: row.id,
              title: row.title,
              body: row.body,
              tag: announcementTagSchema.parse(row.tag),
              pinned: row.pinned,
              publishedOn: row.published_on,
            },
          ]
    );
  }

  async countPublishedSince(
    scope: AnnouncementScope,
    since: string
  ): Promise<number> {
    const row = await this.visible(this.db, scope)
      .where('announcement.status', '=', 'published')
      .where('announcement.published_on', '>=', sql<Date>`${since}::date`)
      .select(sql<number>`count(*)::int`.as('total'))
      .executeTakeFirstOrThrow();
    return row.total;
  }

  create(
    write: AnnouncementWrite,
    activity: ActivityInput
  ): Promise<Announcement> {
    return this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('announcement')
        .values({
          id: write.id,
          organization_id: write.organizationId,
          campus_id: write.fields.campusId,
          title: write.fields.title,
          body: write.fields.body,
          tag: write.fields.tag,
          status: write.fields.status,
          pinned: write.fields.pinned,
          published_on: write.fields.publishedOn,
          withdrawn_at: write.fields.withdrawnAt,
          created_by: write.userId,
          updated_by: write.userId,
          created_at: write.at,
          updated_at: write.at,
        })
        .execute();
      await this.activity.record(trx, activity);
      return this.reload(trx, write);
    });
  }

  update(
    target: AnnouncementTarget,
    decide: (current: Announcement) => AnnouncementChange
  ): Promise<Announcement | undefined> {
    return this.db.transaction().execute(async (trx) => {
      const row = await this.withPeople(trx, target.scope)
        .where('announcement.id', '=', target.id)
        .forUpdate(['announcement'])
        .executeTakeFirst();
      return row && this.applyChange(trx, target, decide(toAnnouncement(row)));
    });
  }

  private async applyChange(
    trx: Database,
    target: AnnouncementTarget,
    change: AnnouncementChange
  ): Promise<Announcement> {
    const { fields, activity } = change;
    await trx
      .updateTable('announcement')
      .set({
        campus_id: fields.campusId,
        title: fields.title,
        body: fields.body,
        tag: fields.tag,
        status: fields.status,
        pinned: fields.pinned,
        published_on: fields.publishedOn,
        withdrawn_at: fields.withdrawnAt,
        updated_by: target.userId,
        updated_at: target.at,
      })
      .where('id', '=', target.id)
      .where('organization_id', '=', target.scope.organizationId)
      .execute();
    await this.activity.record(trx, activity);
    return this.reload(trx, {
      organizationId: target.scope.organizationId,
      id: target.id,
    });
  }

  private async reload(
    trx: Database,
    ids: { organizationId: string; id: string }
  ): Promise<Announcement> {
    const row = await this.withPeople(trx, {
      organizationId: ids.organizationId,
      ...EVERYTHING,
    })
      .where('announcement.id', '=', ids.id)
      .executeTakeFirstOrThrow();
    return toAnnouncement(row);
  }
}
