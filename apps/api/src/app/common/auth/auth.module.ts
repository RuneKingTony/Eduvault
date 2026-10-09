import { Inject, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import type { Pool } from 'pg';
import { ENV_TOKEN, type Env } from '../config/env';
import { DB_TOKEN } from '../db/tokens';
import { AuthContextService } from './auth-context.service';
import { OrganizationAuthGuard } from './guards/organization-auth.guard';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { createAuth } from './better-auth';
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
  providers: [AuthContextService, SessionAuthGuard, OrganizationAuthGuard],
  exports: [AuthContextService, SessionAuthGuard, OrganizationAuthGuard],
})
export class EduvaultAuthModule implements OnApplicationBootstrap {
  constructor(@Inject(DB_TOKEN) private readonly pool: Pool) {}

  async onApplicationBootstrap() {
    await syncAllStarterRoles(this.pool);
  }
}
