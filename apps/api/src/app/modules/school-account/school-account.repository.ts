import type { SchoolProfile } from '@eduvault/api-contract';

export interface SchoolProfilePatch {
  name?: string;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface LogoChange {
  fileId: string | null;
  updatedBy: string;
}

export type LogoChangeResult =
  | { status: 'changed'; previousFileId: string | null }
  | { status: 'no-account' }
  | { status: 'unusable' };

export abstract class SchoolAccountRepository {
  abstract find(organizationId: string): Promise<SchoolProfile | undefined>;

  abstract update(
    organizationId: string,
    patch: SchoolProfilePatch,
    updatedBy: string
  ): Promise<SchoolProfile | undefined>;

  abstract setLogo(
    organizationId: string,
    change: LogoChange
  ): Promise<LogoChangeResult>;
}
