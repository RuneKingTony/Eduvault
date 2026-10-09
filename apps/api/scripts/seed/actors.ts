import type { INestApplicationContext } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
import {
  AuthContextService,
  type AppAuth,
  type OrgContext,
} from '../../src/app/common/auth';
import { SEED_PASSWORD } from './members';

/** Signs the user in and builds the context OrganizationAuthGuard would. */
export async function orgContextFor(
  app: INestApplicationContext,
  email: string
): Promise<OrgContext> {
  const { api } = app.get(AuthService<AppAuth>, { strict: false });
  const { headers } = await api.signInEmail({
    body: { email, password: SEED_PASSWORD },
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');

  const auth = app.get(AuthContextService, { strict: false });
  const session = await auth.resolveSession({
    headers: { cookie },
  } as unknown as Request);
  const ctx = session && (await auth.resolveOrganization(session));
  if (!ctx) {
    throw new Error(`${email} has no active school`);
  }
  return ctx;
}
