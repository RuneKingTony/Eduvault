import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import type {
  ApiErrorCode,
  RouteOutput,
  contract,
} from '@eduvault/api-contract';
import {
  AuthContextService,
  type AppAuth,
  type OrgContext,
  type SessionContext,
} from '../../common/auth';
import { MeRepository } from './me.repository';

@Injectable()
export class MeService {
  constructor(
    private readonly authService: AuthService<AppAuth>,
    private readonly me: MeRepository,
    private readonly context: AuthContextService
  ) {}

  async get(
    session: SessionContext
  ): Promise<RouteOutput<typeof contract.me.get>> {
    const { activeOrganizationId } = session;
    const [schoolCount, suspendedSchool] = await Promise.all([
      this.me.countSchools(session.user.id),
      activeOrganizationId === null
        ? null
        : this.context.findSuspendedSchool(activeOrganizationId),
    ]);
    return {
      user: session.user,
      activeOrganizationId: session.activeOrganizationId,
      activeCampusId: session.activeTeamId,
      mustChangePassword: session.mustChangePassword,
      platformRole: session.platformRole,
      schoolCount,
      suspendedSchool: suspendedSchool ?? null,
    };
  }

  permissions(org: OrgContext): RouteOutput<typeof contract.me.permissions> {
    return {
      organizationId: org.organizationId,
      roles: org.roles,
      permissions: org.permissions,
      campusScope: org.campusScope,
      classScope: org.classScope,
      acting: org.acting && {
        organizationId: org.acting.organizationId,
        writes: org.acting.writes,
      },
    };
  }

  /**
   * Better Auth's `setUserPassword` needs a super admin session, so the hash
   * is written through its context, the way its own routes do.
   */
  async setPassword(
    session: SessionContext,
    newPassword: string
  ): Promise<void> {
    if (!session.mustChangePassword) {
      throw new ConflictException({
        code: 'PasswordAlreadySet' satisfies ApiErrorCode,
        message: 'Your password is already set',
      });
    }
    const context = await this.authService.instance.$context;
    const accounts = await context.internalAdapter.findAccounts(
      session.user.id
    );
    const current = accounts.find(
      (account) => account.providerId === 'credential'
    )?.password;
    if (
      typeof current === 'string' &&
      (await context.password.verify({ hash: current, password: newPassword }))
    ) {
      throw new BadRequestException({
        code: 'ValidationError' satisfies ApiErrorCode,
        message: 'Request validation failed',
        issues: [
          {
            path: 'newPassword',
            message: 'Choose a password different from the temporary one.',
          },
        ],
      });
    }
    await context.internalAdapter.updatePassword(
      session.user.id,
      await context.password.hash(newPassword)
    );
    await context.internalAdapter.updateUser(session.user.id, {
      mustChangePassword: false,
    });
    await this.authService.api.revokeOtherSessions({
      headers: session.headers,
    });
  }
}
