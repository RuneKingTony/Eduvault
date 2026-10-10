import type { INestApplication } from '@nestjs/common';
import type { Request } from 'express';
import { AuthContextService } from '../../../src/app/common/auth';

export async function orgContextFor(
  app: INestApplication,
  actor: { cookie: string }
) {
  const auth = app.get(AuthContextService);
  const req = {
    headers: { cookie: actor.cookie },
  } as unknown as Request;
  const session = await auth.resolveSession(req);
  const ctx = session && (await auth.resolveOrganization(session));
  if (!ctx) {
    throw new Error('The actor has no active school');
  }
  return ctx;
}
