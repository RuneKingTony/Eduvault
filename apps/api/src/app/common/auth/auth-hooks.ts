import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { AfterHook, BeforeHook, Hook } from '@thallesp/nestjs-better-auth';
import { APIError, getSessionFromCtx } from 'better-auth/api';
import {
  MUST_CHANGE_PASSWORD_MESSAGE,
  TOO_MANY_ATTEMPTS_MESSAGE,
} from '@eduvault/api-contract';
import { ENV_TOKEN, type Env } from '../config/env';
import { DB_TOKEN } from '../db/tokens';
import { isSignInLimited } from './better-auth';
import { SignInAttempts } from './sign-in-attempts';
import { findSuspendedSchool } from './suspended-school';

const OPEN_WHILE_FLAGGED = ['/get-session', '/sign-out', '/sign-in/'];

const WRITES_REFUSED_WHILE_SUSPENDED = new Set(
  [
    'update',
    'delete',
    'invite-member',
    'cancel-invitation',
    'remove-member',
    'update-member-role',
    'create-team',
    'update-team',
    'remove-team',
    'add-team-member',
    'remove-team-member',
    'create-role',
    'update-role',
    'delete-role',
  ].map((name) => `/organization/${name}`)
);

const stringIn = (body: unknown, key: string): string | undefined => {
  const value =
    typeof body === 'object' && body !== null && key in body
      ? (body as Record<string, unknown>)[key]
      : undefined;
  return typeof value === 'string' ? value : undefined;
};

const emailIn = (body: unknown) => stringIn(body, 'email');

@Hook()
@Injectable()
export class AuthRequestHooks {
  private readonly attempts = new SignInAttempts();

  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    @Inject(DB_TOKEN) private readonly pool: Pool
  ) {}

  /** Per-account limit; Better Auth's own rate limit only counts per IP. */
  @BeforeHook('/sign-in/email')
  limitSignIn(ctx: { body?: unknown }): void {
    const email = emailIn(ctx.body);
    if (
      isSignInLimited(this.env) &&
      email !== undefined &&
      !this.attempts.allow(email)
    ) {
      throw new APIError('TOO_MANY_REQUESTS', {
        code: 'TOO_MANY_ATTEMPTS',
        message: TOO_MANY_ATTEMPTS_MESSAGE,
      });
    }
  }

  @AfterHook('/sign-in/email')
  clearSignInAttempts(ctx: {
    body?: unknown;
    context: { newSession?: unknown };
  }): void {
    const email = emailIn(ctx.body);
    const { newSession } = ctx.context;
    if (
      email !== undefined &&
      typeof newSession === 'object' &&
      newSession !== null
    ) {
      this.attempts.reset(email);
    }
  }

  /** Better Auth's own routes follow the temporary-password rule too. */
  @BeforeHook()
  async holdTemporaryPassword(
    ctx: Parameters<typeof getSessionFromCtx>[0]
  ): Promise<void> {
    if (OPEN_WHILE_FLAGGED.some((open) => ctx.path.startsWith(open))) {
      return;
    }
    const session = (await getSessionFromCtx(ctx).catch(() => null)) as {
      user: { mustChangePassword?: boolean | null };
    } | null;
    if (session?.user.mustChangePassword === true) {
      throw new APIError('FORBIDDEN', {
        code: 'MustChangePassword',
        message: MUST_CHANGE_PASSWORD_MESSAGE,
      });
    }
  }

  /** Reads and `set-active` stay open so a member can still switch school. */
  @BeforeHook()
  async holdSuspendedSchool(
    ctx: Parameters<typeof getSessionFromCtx>[0]
  ): Promise<void> {
    if (!WRITES_REFUSED_WHILE_SUSPENDED.has(ctx.path)) {
      return;
    }
    const session = (await getSessionFromCtx(ctx).catch(() => null)) as {
      session: { activeOrganizationId?: string | null };
    } | null;
    const organizationId =
      stringIn(ctx.body, 'organizationId') ??
      session?.session.activeOrganizationId ??
      null;
    if (session === null || organizationId === null) {
      return;
    }
    const paused = await findSuspendedSchool(this.pool, organizationId);
    if (paused !== null) {
      throw new APIError('FORBIDDEN', {
        code: 'SchoolSuspended',
        message: `${paused.name} is paused on Eduvault. Contact the school for details.`,
      });
    }
  }
}
