import { Inject, Injectable } from '@nestjs/common';
import type { SchoolProfile } from '@eduvault/api-contract';
import { iso } from '../../common/db/rows';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import {
  SchoolAccountRepository,
  type LogoChange,
  type LogoChangeResult,
  type SchoolProfilePatch,
} from './school-account.repository';

interface Row {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  currency: string;
  admission_prefix: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_file_id: string | null;
  created_at: Date | string;
}

const toProfile = (row: Row): SchoolProfile => ({
  id: row.id,
  organizationId: row.organization_id,
  name: row.name,
  admissionPrefix: row.admission_prefix,
  slug: row.slug,
  city: row.city,
  address: row.address,
  phone: row.phone,
  email: row.email,
  currency: row.currency,
  logoFileId: row.logo_file_id,
  logoUrl: row.logo_file_id === null ? null : `/files/${row.logo_file_id}`,
  createdAt: iso(row.created_at),
});

const PATCH_COLUMNS = ['name', 'city', 'address', 'phone', 'email'] as const;

@Injectable()
export class KyselySchoolAccountRepository extends SchoolAccountRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  private select() {
    return this.db
      .selectFrom('school_account')
      .innerJoin(
        'organization',
        'organization.id',
        'school_account.organization_id'
      )
      .select([
        'school_account.id',
        'school_account.organization_id',
        'school_account.name',
        'organization.slug',
        'school_account.currency',
        'school_account.admission_prefix',
        'school_account.city',
        'school_account.address',
        'school_account.phone',
        'school_account.email',
        'school_account.logo_file_id',
        'school_account.created_at',
      ]);
  }

  async find(organizationId: string): Promise<SchoolProfile | undefined> {
    const row = await this.select()
      .where('school_account.organization_id', '=', organizationId)
      .executeTakeFirst();
    return row && toProfile(row);
  }

  async update(
    organizationId: string,
    patch: SchoolProfilePatch,
    updatedBy: string
  ): Promise<SchoolProfile | undefined> {
    const changes = Object.fromEntries(
      PATCH_COLUMNS.filter((column) => patch[column] !== undefined).map(
        (column) => [column, patch[column]]
      )
    );
    await this.db
      .updateTable('school_account')
      .set({ ...changes, updated_by: updatedBy, updated_at: new Date() })
      .where('organization_id', '=', organizationId)
      .execute();
    return this.find(organizationId);
  }

  setLogo(
    organizationId: string,
    change: LogoChange
  ): Promise<LogoChangeResult> {
    return this.db.transaction().execute(async (trx) => {
      const current = await trx
        .selectFrom('school_account')
        .select('logo_file_id')
        .where('organization_id', '=', organizationId)
        .forUpdate()
        .executeTakeFirst();
      if (current === undefined) {
        return { status: 'no-account' };
      }
      if (change.fileId !== null) {
        const upload = await trx
          .selectFrom('file_object')
          .select('id')
          .where('id', '=', change.fileId)
          .where('organization_id', '=', organizationId)
          .where('kind', '=', 'school_logo')
          .forShare()
          .executeTakeFirst();
        if (upload === undefined || current.logo_file_id === change.fileId) {
          return { status: 'unusable' };
        }
      }
      await trx
        .updateTable('school_account')
        .set({
          logo_file_id: change.fileId,
          updated_by: change.updatedBy,
          updated_at: new Date(),
        })
        .where('organization_id', '=', organizationId)
        .execute();
      return { status: 'changed', previousFileId: current.logo_file_id };
    });
  }
}
