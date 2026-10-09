import { Injectable, NotFoundException } from '@nestjs/common';
import type { SchoolAccount } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import {
  SchoolAccountRepository,
  type NewSchoolAccount,
  type SchoolAccountPatch,
} from './school-account.repository';

@Injectable()
export class SchoolAccountService {
  constructor(private readonly accounts: SchoolAccountRepository) {}

  async get(ctx: OrgContext): Promise<SchoolAccount> {
    const account = await this.accounts.find(ctx.organizationId);
    if (!account) {
      throw new NotFoundException('School account not found');
    }
    return account;
  }

  create(ctx: OrgContext, input: NewSchoolAccount): Promise<SchoolAccount> {
    return this.accounts.create(ctx.organizationId, input);
  }

  async update(
    ctx: OrgContext,
    input: SchoolAccountPatch
  ): Promise<SchoolAccount> {
    const account = await this.accounts.update(ctx.organizationId, input);
    if (!account) {
      throw new NotFoundException('School account not found');
    }
    return account;
  }

  async remove(ctx: OrgContext): Promise<{ id: string }> {
    const id = await this.accounts.remove(ctx.organizationId);
    if (id === undefined) {
      throw new NotFoundException('School account not found');
    }
    return { id };
  }
}
