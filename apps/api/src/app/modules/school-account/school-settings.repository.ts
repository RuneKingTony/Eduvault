import type { SchoolSettings } from '@eduvault/api-contract';

export interface SchoolSettingsPatch {
  maxGuardians?: number;
  requireGuardian?: boolean;
}

export abstract class SchoolSettingsRepository {
  abstract find(organizationId: string): Promise<SchoolSettings | undefined>;

  abstract update(
    organizationId: string,
    patch: SchoolSettingsPatch,
    updatedBy: string
  ): Promise<SchoolSettings | undefined>;
}
