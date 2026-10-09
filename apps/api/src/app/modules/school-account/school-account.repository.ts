import type { SchoolAccount } from '@eduvault/api-contract';

export interface NewSchoolAccount {
  name: string;
  currency: string;
}

export type SchoolAccountPatch = Partial<NewSchoolAccount>;

export abstract class SchoolAccountRepository {
  abstract find(organizationId: string): Promise<SchoolAccount | undefined>;

  abstract create(
    organizationId: string,
    input: NewSchoolAccount
  ): Promise<SchoolAccount>;

  abstract update(
    organizationId: string,
    patch: SchoolAccountPatch
  ): Promise<SchoolAccount | undefined>;

  /** Resolves to the removed account's id, or undefined when none existed. */
  abstract remove(organizationId: string): Promise<string | undefined>;
}
