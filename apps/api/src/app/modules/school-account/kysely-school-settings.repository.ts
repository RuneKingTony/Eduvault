import { Inject, Injectable } from '@nestjs/common';
import type { SchoolSettings } from '@eduvault/api-contract';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { findSchoolRules } from '../../common/people';
import {
  SchoolSettingsRepository,
  type SchoolSettingsPatch,
} from './school-settings.repository';

@Injectable()
export class KyselySchoolSettingsRepository extends SchoolSettingsRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  find(organizationId: string): Promise<SchoolSettings | undefined> {
    return findSchoolRules(this.db, organizationId);
  }

  async update(
    organizationId: string,
    patch: SchoolSettingsPatch,
    updatedBy: string
  ): Promise<SchoolSettings | undefined> {
    const row = await this.db
      .updateTable('school_setting')
      .set({
        ...(patch.maxGuardians === undefined
          ? {}
          : { max_guardians: patch.maxGuardians }),
        ...(patch.requireGuardian === undefined
          ? {}
          : { require_guardian: patch.requireGuardian }),
        updated_by: updatedBy,
        updated_at: new Date(),
      })
      .where('organization_id', '=', organizationId)
      .returning(['max_guardians', 'require_guardian'])
      .executeTakeFirst();
    return (
      row && {
        maxGuardians: row.max_guardians,
        requireGuardian: row.require_guardian,
      }
    );
  }
}
