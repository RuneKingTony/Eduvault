import { Injectable, NotFoundException } from '@nestjs/common';
import type { SchoolSettings } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import {
  SchoolSettingsRepository,
  type SchoolSettingsPatch,
} from './school-settings.repository';

const notFound = () => new NotFoundException('School settings not found');

@Injectable()
export class SchoolSettingsService {
  constructor(private readonly settings: SchoolSettingsRepository) {}

  async get(ctx: OrgContext): Promise<SchoolSettings> {
    const found = await this.settings.find(ctx.organizationId);
    if (!found) {
      throw notFound();
    }
    return found;
  }

  async update(
    ctx: OrgContext,
    patch: SchoolSettingsPatch
  ): Promise<SchoolSettings> {
    const updated = await this.settings.update(
      ctx.organizationId,
      patch,
      ctx.user.id
    );
    if (!updated) {
      throw notFound();
    }
    return updated;
  }
}
