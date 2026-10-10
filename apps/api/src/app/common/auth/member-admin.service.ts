import { Inject, Injectable } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { getOrgAdapter } from 'better-auth/plugins';
import type { Pool } from 'pg';
import { MEMBER_ROLE } from '@eduvault/policy';
import { DB_TOKEN } from '../db/tokens';
import { AccountService } from './account.service';
import { withSchoolLock } from '../db/with-school-lock';
import type { AppAuth } from './better-auth';
import { getOrganizationOptions } from './better-auth-base';

type OrgAdapter = ReturnType<typeof getOrgAdapter>;
type AdapterContext = Parameters<typeof getOrgAdapter>[0];

interface NewMember {
  organizationId: string;
  userId: string;
  title: string;
  campusIds: readonly string[];
}

interface MemberChange {
  memberId: string;
  userId: string;
  roles: readonly string[];
  addCampusIds: readonly string[];
  removeCampusIds: readonly string[];
}

interface CampusChange {
  userId: string;
  addCampusIds: readonly string[];
  removeCampusIds: readonly string[];
}

interface MemberRemoval {
  memberId: string;
  organizationId: string;
  userId: string;
}

/**
 * Writes go through Better Auth's organization adapter, which keeps
 * `membershipKey` and `memberCount` right; each method is one transaction.
 */
@Injectable()
export class MemberAdminService {
  constructor(
    private readonly authService: AuthService<AppAuth>,
    private readonly accounts: AccountService,
    @Inject(DB_TOKEN) private readonly pool: Pool
  ) {}

  findAccount(email: string) {
    return this.accounts.findByEmail(email);
  }

  createAccount(input: Parameters<AccountService['createAccount']>[0]) {
    return this.accounts.createAccount(input);
  }

  resetPassword(userId: string): Promise<string> {
    return this.accounts.resetPassword(userId);
  }

  /** Compensates a failed add: only for an account this request created. */
  deleteAccount(userId: string): Promise<void> {
    return this.accounts.deleteAccount(userId);
  }

  underSchoolLock<T>(organizationId: string, fn: () => Promise<T>): Promise<T> {
    return withSchoolLock(this.pool, organizationId, fn);
  }

  addMember({
    organizationId,
    userId,
    title,
    campusIds,
  }: NewMember): Promise<void> {
    return this.inTransaction(async (org) => {
      await org.createMember({
        organizationId,
        userId,
        role: MEMBER_ROLE,
        createdAt: new Date(),
        title,
      });
      await this.moveCampuses(org, { userId, add: campusIds, remove: [] });
    });
  }

  setRolesAndCampuses({
    memberId,
    userId,
    roles,
    addCampusIds,
    removeCampusIds,
  }: MemberChange): Promise<void> {
    return this.inTransaction(async (org) => {
      await org.updateMember(memberId, roles.join(','));
      await this.moveCampuses(org, {
        userId,
        add: addCampusIds,
        remove: removeCampusIds,
      });
    });
  }

  setCampuses({
    userId,
    addCampusIds,
    removeCampusIds,
  }: CampusChange): Promise<void> {
    return this.inTransaction((org) =>
      this.moveCampuses(org, {
        userId,
        add: addCampusIds,
        remove: removeCampusIds,
      })
    );
  }

  /** The user account stays. */
  removeMember(removal: MemberRemoval): Promise<void> {
    return this.inTransaction((org) => org.deleteMember(removal));
  }

  private async moveCampuses(
    org: OrgAdapter,
    change: {
      userId: string;
      add: readonly string[];
      remove: readonly string[];
    }
  ): Promise<void> {
    const { userId } = change;
    for (const teamId of change.add) {
      await org.findOrCreateTeamMember({ teamId, userId });
    }
    for (const teamId of change.remove) {
      await org.removeTeamMember({ teamId, userId });
    }
  }

  // The org adapter reads its database through the adapter it is built on, so
  // building it on the transaction's adapter puts every call in that transaction.
  private async inTransaction<T>(
    fn: (org: OrgAdapter) => Promise<T>
  ): Promise<T> {
    const context = (await this.authService.instance
      .$context) as unknown as AdapterContext;
    return context.adapter.transaction((trx) =>
      fn(
        getOrgAdapter(
          { ...context, adapter: trx } as unknown as AdapterContext,
          getOrganizationOptions(this.pool)
        )
      )
    );
  }
}
