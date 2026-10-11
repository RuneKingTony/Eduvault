import { Inject, Injectable } from '@nestjs/common';
import { lagosDateOf } from '@eduvault/shared';
import type { OrgContext } from '../auth';
import { ENV_TOKEN, type Env } from '../config/env';

@Injectable()
export class Clock {
  private pinned: string | null = null;

  constructor(
    @Inject(ENV_TOKEN)
    private readonly env: Pick<Env, 'NODE_ENV'> = { NODE_ENV: 'development' }
  ) {}

  today(): string {
    return this.pinned ?? lagosDateOf(new Date());
  }

  now(): string {
    return this.pinned === null
      ? new Date().toISOString()
      : `${this.pinned}T12:00:00.000Z`;
  }

  set(date: string | null): void {
    // The pin is process-wide, so production must never be able to move "today".
    if (this.env.NODE_ENV === 'production') {
      throw new Error('The clock cannot be pinned in production');
    }
    this.pinned = date;
  }
}

/** Today for the school in `ctx`; one helper so a per-school zone can replace it. */
export const schoolToday = (
  _ctx: Pick<OrgContext, 'organizationId'>,
  clock: Clock
): string => clock.today();
