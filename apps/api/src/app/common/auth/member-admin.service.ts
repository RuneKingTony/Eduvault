import { Inject, Injectable } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { getAdapter } from 'better-auth/db/adapter';
import { getOrgAdapter } from 'better-auth/plugins';
import { Kysely, PostgresDialect } from 'kysely';
import type { Pool } from 'pg';
import { MEMBER_ROLE } from '@eduvault/policy';
import type { DB } from '../../../db/db-types';
import { endClassTeaching, type TeachingScope } from '../db/end-class-teaching';
import { DB_TOKEN, type Database } from '../db/tokens';
import { AccountService } from './account.service';
import { withSchoolLock } from '../db/with-school-lock';
import type { AppAuth } from './better-auth';
import { getOrganizationOptions } from './better-auth-base';

type OrgAdapter = ReturnType<typeof getOrgAdapter>;
type AdapterContext = Parameters<typeof getOrgAdapter>[0];

interface MemberWork {
  org: OrgAdapter;
  db: Database;
}

interface NewMember {
  organizationId: string;
  userId: string;
  title: string;
  campusIds: readonly string[];
}

export type TeachingEnd =
  { kind: 'none' } | { kind: 'removedCampuses' } | TeachingScope;

interface CampusChange {
  organizationId: string;
  userId: string;
  addCampusIds: readonly string[];
  removeCampusIds: readonly string[];
  teachingEnd: TeachingEnd;
}

interface MemberChange extends CampusChange {
  memberId: string;
  roles: readonly string[];
}

function teachingScope(
  end: TeachingEnd,
  removedCampusIds: readonly string[]
): TeachingScope | undefined {
  if (end.kind === 'none') {
    return undefined;
  }
  return end.kind === 'removedCampuses'
    ? { kind: 'on', campusIds: removedCampusIds }
    : end;
}

interface OwnershipHandover {
  target: { memberId: string; roles: readonly string[] };
  caller: { memberId: string; roles: readonly string[] };
}

interface MemberRemoval {
  memberId: string;
  organizationId: string;
  userId: string;
}

/**
 * Writes go through Better Auth's organization adapter, which keeps
 * `membershipKey` and `memberCount` right; each method is one transaction.
 * The adapter is built on the app's own Kysely transaction, so the
 * class-teacher rows of a member who leaves go in the same one.
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
    return this.inTransaction(async (work) => {
      await work.org.createMember({
        organizationId,
        userId,
        role: MEMBER_ROLE,
        createdAt: new Date(),
        title,
      });
      await this.moveCampuses(work.org, {
        userId,
        addCampusIds: campusIds,
        removeCampusIds: [],
      });
    });
  }

  setRolesAndCampuses({
    memberId,
    roles,
    ...change
  }: MemberChange): Promise<void> {
    return this.inTransaction(async ({ org, db }) => {
      await org.updateMember(memberId, roles.join(','));
      await this.moveAndEndTeaching({ org, db }, change);
    });
  }

  handOverOwnership({ target, caller }: OwnershipHandover): Promise<void> {
    return this.inTransaction(async ({ org }) => {
      await org.updateMember(target.memberId, target.roles.join(','));
      await org.updateMember(caller.memberId, caller.roles.join(','));
    });
  }

  setCampuses(change: CampusChange): Promise<void> {
    return this.inTransaction((work) => this.moveAndEndTeaching(work, change));
  }

  /** The user account stays. */
  removeMember(removal: MemberRemoval): Promise<void> {
    return this.inTransaction(async ({ org, db }) => {
      await org.deleteMember(removal);
      await endClassTeaching(db, removal);
    });
  }

  private async moveAndEndTeaching(
    { org, db }: MemberWork,
    { teachingEnd, organizationId, ...move }: CampusChange
  ): Promise<void> {
    await this.moveCampuses(org, move);
    const scope = teachingScope(teachingEnd, move.removeCampusIds);
    if (scope !== undefined) {
      await endClassTeaching(db, {
        organizationId,
        userId: move.userId,
        scope,
      });
    }
  }

  private async moveCampuses(
    org: OrgAdapter,
    {
      userId,
      addCampusIds,
      removeCampusIds,
    }: Pick<CampusChange, 'userId' | 'addCampusIds' | 'removeCampusIds'>
  ): Promise<void> {
    for (const teamId of addCampusIds) {
      await org.findOrCreateTeamMember({ teamId, userId });
    }
    for (const teamId of removeCampusIds) {
      await org.removeTeamMember({ teamId, userId });
    }
  }

  private kyselyOnPool: Database | undefined;

  // Shares the pool, so there is nothing to destroy.
  private kysely(): Database {
    this.kyselyOnPool ??= new Kysely<DB>({
      dialect: new PostgresDialect({ pool: this.pool }),
    });
    return this.kyselyOnPool;
  }

  // The org adapter reads its database through the adapter it is built on.
  // Better Auth's own transaction adapter cannot reach tables outside its
  // schema, so the adapter is built on our transaction instead. Its schema
  // check needs a connection a transaction cannot give; the app's own
  // adapter has already run it.
  private async inTransaction<T>(
    fn: (work: MemberWork) => Promise<T>
  ): Promise<T> {
    const context = (await this.authService.instance
      .$context) as unknown as AdapterContext;
    return this.kysely()
      .transaction()
      .execute(async (db) => {
        const { options } = context;
        const adapter = await getAdapter({
          ...options,
          database: { db, type: 'postgres' },
          advanced: {
            ...options.advanced,
            database: { ...options.advanced?.database, validateSchema: false },
          },
        });
        const org = getOrgAdapter(
          { ...context, adapter },
          getOrganizationOptions(this.pool)
        );
        return fn({ org, db });
      });
  }
}
