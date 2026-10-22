import type {
  Announcement,
  AnnouncementList,
  AnnouncementListQuery,
  AnnouncementSummary,
} from '@eduvault/api-contract';
import type { ActivityInput } from '../../common/activity';
import type { AnnouncementFields } from './announcement-rules';
import type { OrgScope } from '../../common/scope';

export interface AnnouncementWrite {
  organizationId: string;
  id: string;
  userId: string;
  at: Date;
  fields: AnnouncementFields;
}

export interface AnnouncementChange {
  fields: AnnouncementFields;
  activity: ActivityInput;
}

export interface AnnouncementTarget {
  scope: OrgScope;
  id: string;
  userId: string;
  at: Date;
}

export abstract class AnnouncementRepository {
  abstract list(
    scope: OrgScope,
    query: AnnouncementListQuery
  ): Promise<AnnouncementList>;

  abstract findById(
    scope: OrgScope,
    id: string
  ): Promise<Announcement | undefined>;

  abstract feed(scope: OrgScope, limit: number): Promise<AnnouncementSummary[]>;

  abstract publishedPage(
    scope: OrgScope,
    paging: { page: number; pageSize: number }
  ): Promise<{ items: AnnouncementSummary[]; total: number }>;

  abstract countPublishedSince(scope: OrgScope, since: string): Promise<number>;

  abstract create(
    write: AnnouncementWrite,
    activity: ActivityInput
  ): Promise<Announcement>;

  abstract update(
    target: AnnouncementTarget,
    decide: (current: Announcement) => AnnouncementChange
  ): Promise<Announcement | undefined>;
}
