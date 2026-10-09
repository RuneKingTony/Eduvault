import type {
  PlatformSchool,
  PlatformSchoolMember,
} from '@eduvault/api-contract';
import type { PlatformAuditEntry } from '../../common/audit';

export interface NewSchoolAccountRow {
  organizationId: string;
  name: string;
  city: string | null;
  admissionPrefix: string;
  currency: string;
}

export interface SchoolKey {
  name: string;
  id: string;
}

export interface SchoolPage {
  items: PlatformSchool[];
  next: SchoolKey | undefined;
}

export interface SchoolTotals {
  schools: number;
  active: number;
  students: number;
}

export interface OwnerReplacement {
  organizationId: string;
  newOwnerUserId: string;
  previousOwner: 'member' | 'remove';
  audit: PlatformAuditEntry;
}

/** Platform data spans every school, so nothing here filters by organization. */
export abstract class PlatformRepository {
  abstract listSchools(input: {
    q?: string;
    after?: SchoolKey;
    limit: number;
  }): Promise<SchoolPage>;

  abstract totals(): Promise<SchoolTotals>;

  abstract listSchoolOptions(): Promise<{ id: string; name: string }[]>;

  abstract findSchool(
    organizationId: string
  ): Promise<PlatformSchool | undefined>;

  abstract listMembers(organizationId: string): Promise<PlatformSchoolMember[]>;

  abstract findMember(
    organizationId: string,
    memberId: string
  ): Promise<PlatformSchoolMember | undefined>;

  abstract setSuspended(input: {
    organizationId: string;
    by: string | null;
    audit: PlatformAuditEntry;
  }): Promise<boolean>;

  abstract replaceOwner(input: OwnerReplacement): Promise<void>;

  abstract slugTaken(slug: string): Promise<boolean>;

  abstract insertSchoolAccount(input: NewSchoolAccountRow): Promise<void>;
}
