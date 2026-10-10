import type { MemberSummary, SchoolRoleEntry } from '@eduvault/api-contract';
import type { CampusScope } from '../../common/campus-scope';

/** A member with every campus they belong to, whatever the viewer can see. */
export type MemberRecord = MemberSummary;

export interface MemberListQuery {
  organizationId: string;
  scope: CampusScope;
  q?: string;
  role?: string;
  page: number;
}

export abstract class MembersRepository {
  abstract list(
    query: MemberListQuery
  ): Promise<{ items: MemberRecord[]; total: number }>;

  abstract findById(
    organizationId: string,
    id: string
  ): Promise<MemberRecord | undefined>;

  abstract findByUser(
    organizationId: string,
    userId: string
  ): Promise<MemberRecord | undefined>;

  abstract countOwners(organizationId: string): Promise<number>;

  abstract belongsToOtherSchool(
    userId: string,
    organizationId: string
  ): Promise<boolean>;

  abstract listRoles(organizationId: string): Promise<SchoolRoleEntry[]>;
}
