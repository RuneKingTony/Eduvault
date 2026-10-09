import type { PlatformSchool } from '@eduvault/api-contract';

export interface NewSchoolAccountRow {
  organizationId: string;
  name: string;
  city: string | null;
  admissionPrefix: string;
  currency: string;
}

/** Platform data spans every school, so nothing here filters by organization. */
export abstract class PlatformRepository {
  abstract listSchools(): Promise<PlatformSchool[]>;

  abstract findSchool(
    organizationId: string
  ): Promise<PlatformSchool | undefined>;

  abstract slugTaken(slug: string): Promise<boolean>;

  abstract insertSchoolAccount(input: NewSchoolAccountRow): Promise<void>;
}
