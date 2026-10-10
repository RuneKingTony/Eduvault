import { Inject, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import type { Pool } from 'pg';
import { ENV_TOKEN, type Env } from '../config/env';
import { DB_TOKEN } from '../db/tokens';
import { AccountService } from './account.service';
import { AuthContextService } from './auth-context.service';
import { AuthRequestHooks } from './auth-hooks';
import { OrganizationAuthGuard } from './guards/organization-auth.guard';
import { PlatformAuthGuard } from './guards/platform-auth.guard';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { createAuth } from './better-auth';
import { MemberAdminService } from './member-admin.service';
import { OrganizationAdminService } from './organization-admin.service';
import { RoleAdminService } from './role-admin.service';
import { syncAllStarterRoles } from './starter-roles';

@Module({
  imports: [
    AuthModule.forRootAsync({
      useFactory: (pool: Pool, env: Env) => ({
        auth: createAuth(pool, env),
        disableTrustedOriginsCors: true,
      }),
      inject: [DB_TOKEN, ENV_TOKEN],
      disableGlobalAuthGuard: true,
    }),
  ],
  providers: [
    AccountService,
    AuthContextService,
    AuthRequestHooks,
    MemberAdminService,
    OrganizationAdminService,
    RoleAdminService,
    SessionAuthGuard,
    OrganizationAuthGuard,
    PlatformAuthGuard,
  ],
  exports: [
    AccountService,
    AuthContextService,
    MemberAdminService,
    OrganizationAdminService,
    RoleAdminService,
    SessionAuthGuard,
    OrganizationAuthGuard,
    PlatformAuthGuard,
  ],
})
export class EduvaultAuthModule implements OnApplicationBootstrap {
  constructor(@Inject(DB_TOKEN) private readonly pool: Pool) {}

  async onApplicationBootstrap() {
    await syncAllStarterRoles(this.pool);
  }
}
