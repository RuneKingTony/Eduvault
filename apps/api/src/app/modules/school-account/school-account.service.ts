import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SchoolProfile } from '@eduvault/api-contract';
import { OrganizationAdminService, type OrgContext } from '../../common/auth';
import { FILE_KIND_RULES, FilesService } from '../../common/files';
import {
  SchoolAccountRepository,
  type LogoChange,
  type SchoolProfilePatch,
} from './school-account.repository';

const notFound = () => new NotFoundException('School account not found');

@Injectable()
export class SchoolAccountService {
  constructor(
    private readonly accounts: SchoolAccountRepository,
    private readonly files: FilesService,
    private readonly organizations: OrganizationAdminService
  ) {}

  async get(ctx: OrgContext): Promise<SchoolProfile> {
    const account = await this.accounts.find(ctx.organizationId);
    if (!account) {
      throw notFound();
    }
    return account;
  }

  async update(
    ctx: OrgContext,
    patch: SchoolProfilePatch
  ): Promise<SchoolProfile> {
    const before = await this.get(ctx);
    const account = await this.accounts.update(
      ctx.organizationId,
      patch,
      ctx.user.id
    );
    if (!account) {
      throw notFound();
    }
    if (patch.name !== undefined && patch.name !== before.name) {
      await this.syncOrganizationName(ctx, before.name, patch.name);
    }
    return account;
  }

  async setLogo(ctx: OrgContext, fileId: string): Promise<SchoolProfile> {
    await this.changeLogo(ctx, { fileId, updatedBy: ctx.user.id });
    return this.get(ctx);
  }

  async removeLogo(ctx: OrgContext): Promise<SchoolProfile> {
    await this.changeLogo(ctx, { fileId: null, updatedBy: ctx.user.id });
    return this.get(ctx);
  }

  private async changeLogo(ctx: OrgContext, change: LogoChange): Promise<void> {
    const result = await this.accounts.setLogo(ctx.organizationId, change);
    if (result.status === 'no-account') {
      throw notFound();
    }
    if (result.status === 'unusable') {
      throw new BadRequestException(FILE_KIND_RULES.school_logo.unusable);
    }
    if (result.previousFileId !== null) {
      await this.files.discardById(ctx.organizationId, result.previousFileId);
    }
  }

  private async syncOrganizationName(
    ctx: OrgContext,
    previous: string,
    name: string
  ): Promise<void> {
    try {
      await this.organizations.renameOrganization(ctx.organizationId, name);
    } catch (error) {
      await this.accounts.update(
        ctx.organizationId,
        { name: previous },
        ctx.user.id
      );
      throw error;
    }
  }
}
