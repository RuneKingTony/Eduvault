import { Inject, Injectable } from '@nestjs/common';
import type { SchoolSettings } from '@eduvault/api-contract';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import {
  SchoolSettingsRepository,
  type SchoolSettingsPatch,
} from './school-settings.repository';

interface Row {
  max_guardians: number;
  require_guardian: boolean;
}

const toSettings = (row: Row): SchoolSettings => ({
  maxGuardians: row.max_guardians,
  requireGuardian: row.require_guardian,
});

@Injectable()
export class KyselySchoolSettingsRepository extends SchoolSettingsRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  async find(organizationId: string): Promise<SchoolSettings | undefined> {
    const row = await this.db
      .selectFrom('school_setting')
      .select(['max_guardians', 'require_guardian'])
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();
    return row && toSettings(row);
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
    return row && toSettings(row);
  }
}
