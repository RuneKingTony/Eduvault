import { Inject, Injectable } from '@nestjs/common';
import { AfterHook, BeforeHook, Hook } from '@thallesp/nestjs-better-auth';
import { APIError, getSessionFromCtx } from 'better-auth/api';
import {
  MUST_CHANGE_PASSWORD_MESSAGE,
  TOO_MANY_ATTEMPTS_MESSAGE,
} from '@eduvault/api-contract';
import { ENV_TOKEN, type Env } from '../config/env';
import { isSignInLimited } from './better-auth';
import { SignInAttempts } from './sign-in-attempts';

const OPEN_WHILE_FLAGGED = ['/get-session', '/sign-out', '/sign-in/'];

const emailIn = (body: unknown): string | undefined => {
  const email =
    typeof body === 'object' && body !== null && 'email' in body
      ? body.email
      : undefined;
  return typeof email === 'string' ? email : undefined;
};

@Hook()
@Injectable()
export class AuthRequestHooks {
  private readonly attempts = new SignInAttempts();

  constructor(@Inject(ENV_TOKEN) private readonly env: Env) {}

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
}
