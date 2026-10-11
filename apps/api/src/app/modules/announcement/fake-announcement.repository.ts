import type {
  Announcement,
  AnnouncementList,
  AnnouncementListQuery,
  AnnouncementSummary,
} from '@eduvault/api-contract';
import type { ActivityInput } from '../../common/activity';
import { canSeeCampus } from '../../common/campus-scope';
import {
  AnnouncementRepository,
  type AnnouncementChange,
  type AnnouncementScope,
  type AnnouncementTarget,
  type AnnouncementWrite,
} from './announcement.repository';

export class FakeAnnouncementRepository extends AnnouncementRepository {
  rows: Announcement[] = [];
  organizationOf = new Map<string, string>();
  writes: AnnouncementWrite[] = [];
  activities: ActivityInput[] = [];

  seed(organizationId: string, row: Announcement): void {
    this.rows.push(row);
    this.organizationOf.set(row.id, organizationId);
  }

  private visible(scope: AnnouncementScope): Announcement[] {
    return this.rows.filter(
      (row) =>
        this.organizationOf.get(row.id) === scope.organizationId &&
        (row.campusId === null || canSeeCampus(scope.campusScope, row.campusId))
    );
  }

  list(
    scope: AnnouncementScope,
    query: AnnouncementListQuery
  ): Promise<AnnouncementList> {
    const all = this.visible(scope);
    const matching = all.filter(
      (row) => query.status === undefined || row.status === query.status
    );
    const start = (query.page - 1) * query.pageSize;
    const count = (status: Announcement['status']) =>
      all.filter((row) => row.status === status).length;
    return Promise.resolve({
      items: matching.slice(start, start + query.pageSize),
      total: matching.length,
      counts: {
        published: count('published'),
        draft: count('draft'),
        withdrawn: count('withdrawn'),
      },
    });
  }

  findById(
    scope: AnnouncementScope,
    id: string
  ): Promise<Announcement | undefined> {
    return Promise.resolve(this.visible(scope).find((row) => row.id === id));
  }

  feed(
    scope: AnnouncementScope,
    limit: number
  ): Promise<AnnouncementSummary[]> {
    return Promise.resolve(
      this.visible(scope)
        .filter((row) => row.status === 'published')
        .slice(0, limit)
        .flatMap((row) =>
          row.publishedOn === null
            ? []
            : [
                {
                  id: row.id,
                  title: row.title,
                  body: row.body,
                  tag: row.tag,
                  pinned: row.pinned,
                  publishedOn: row.publishedOn,
                },
              ]
        )
    );
  }

  countPublishedSince(
    scope: AnnouncementScope,
    since: string
  ): Promise<number> {
    return Promise.resolve(
      this.visible(scope).filter(
        (row) =>
          row.status === 'published' &&
          row.publishedOn !== null &&
          row.publishedOn >= since
      ).length
    );
  }

  private store(
    write: AnnouncementWrite,
    activity: ActivityInput
  ): Announcement {
    this.writes.push(write);
    this.activities.push(activity);
    const existing = this.rows.find((row) => row.id === write.id);
    const row: Announcement = {
      id: write.id,
      ...write.fields,
      campusName: write.fields.campusId === null ? null : 'Campus',
      createdBy: existing?.createdBy ?? { id: write.userId, name: 'Author' },
      updatedBy: { id: write.userId, name: 'Editor' },
      updatedAt: '2026-10-11T09:30:00.000Z',
    };
    this.rows = this.rows.filter((candidate) => candidate.id !== write.id);
    this.rows.push(row);
    this.organizationOf.set(row.id, write.organizationId);
    return row;
  }

  create(
    write: AnnouncementWrite,
    activity: ActivityInput
  ): Promise<Announcement> {
    return Promise.resolve(this.store(write, activity));
  }

  async update(
    target: AnnouncementTarget,
    decide: (current: Announcement) => AnnouncementChange
  ): Promise<Announcement | undefined> {
    const current = await this.findById(target.scope, target.id);
    if (current === undefined) {
      return undefined;
    }
    const change = decide(current);
    return this.store(
      {
        organizationId: target.scope.organizationId,
        id: target.id,
        userId: target.userId,
        at: target.at,
        fields: change.fields,
      },
      change.activity
    );
  }
}
