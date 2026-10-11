import type {
  Announcement,
  AnnouncementList,
  AnnouncementListQuery,
  AnnouncementSummary,
} from '@eduvault/api-contract';
import type { ActivityInput } from '../../common/activity';
import type { CampusScope } from '../../common/campus-scope';
import type { AnnouncementFields } from './announcement-rules';

export interface AnnouncementScope {
  organizationId: string;
  campusScope: CampusScope;
}

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
  scope: AnnouncementScope;
  id: string;
  userId: string;
  at: Date;
}

export abstract class AnnouncementRepository {
  abstract list(
    scope: AnnouncementScope,
    query: AnnouncementListQuery
  ): Promise<AnnouncementList>;

  abstract findById(
    scope: AnnouncementScope,
    id: string
  ): Promise<Announcement | undefined>;

  abstract feed(
    scope: AnnouncementScope,
    limit: number
  ): Promise<AnnouncementSummary[]>;

  abstract create(
    write: AnnouncementWrite,
    activity: ActivityInput
  ): Promise<Announcement>;

  abstract update(
    target: AnnouncementTarget,
    decide: (current: Announcement) => AnnouncementChange
  ): Promise<Announcement | undefined>;
}
