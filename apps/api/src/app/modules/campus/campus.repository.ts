import type { Campus } from '@eduvault/api-contract';
import type { CampusScope } from '../../common/campus-scope';

export interface NewCampus {
  id: string;
  address: string | null;
}

export interface CampusMemberRecord {
  campusId: string;
  userId: string;
  name: string;
  roles: string[];
}

export abstract class CampusRepository {
  abstract list(organizationId: string, scope: CampusScope): Promise<Campus[]>;

  abstract findById(
    organizationId: string,
    id: string
  ): Promise<Campus | undefined>;

  abstract nameTaken(
    organizationId: string,
    name: string,
    exceptId?: string
  ): Promise<boolean>;

  abstract membersOf(
    organizationId: string,
    campusIds: readonly string[]
  ): Promise<CampusMemberRecord[]>;

  abstract existsInSchool(organizationId: string, id: string): Promise<boolean>;

  /** Whether any students or fee schedules still reference the campus. */
  abstract hasDependents(organizationId: string, id: string): Promise<boolean>;

  abstract create(organizationId: string, input: NewCampus): Promise<void>;

  abstract updateAddress(
    organizationId: string,
    id: string,
    address: string | null
  ): Promise<void>;
}
