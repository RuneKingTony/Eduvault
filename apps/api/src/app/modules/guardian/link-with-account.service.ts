import { Injectable } from '@nestjs/common';
import type { GuardianLink, LinkGuardianResult } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { ReservedAccountService } from '../gateway/reserved-account.service';
import { GuardianService } from './guardian.service';

/** Links a guardian or changes a link, then asks Monnify for the family's account once that has committed. */
@Injectable()
export class LinkWithAccountService {
  constructor(
    private readonly guardians: GuardianService,
    private readonly reservedAccounts: ReservedAccountService
  ) {}

  async link(
    ctx: OrgContext,
    studentId: string,
    draft: Parameters<GuardianService['link']>[2]
  ): Promise<LinkGuardianResult> {
    const linked = await this.guardians.link(ctx, studentId, draft);
    await this.reservedAccounts.tryEnsureForGuardian(
      ctx.organizationId,
      linked.link.guardianId
    );
    return linked;
  }

  async updateLink(
    ctx: OrgContext,
    key: { studentId: string; guardianId: string },
    patch: Parameters<GuardianService['updateLink']>[2]
  ): Promise<GuardianLink> {
    const updated = await this.guardians.updateLink(ctx, key, patch);
    if (patch.paysFees === true) {
      await this.reservedAccounts.tryEnsureForGuardian(
        ctx.organizationId,
        key.guardianId
      );
    }
    return updated;
  }
}
