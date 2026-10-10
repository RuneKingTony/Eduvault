import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { DB_TOKEN } from './tokens';
import { withSchoolLock } from './with-school-lock';

@Injectable()
export class SchoolLock {
  constructor(@Inject(DB_TOKEN) private readonly pool: Pool) {}

  run<T>(organizationId: string, fn: () => Promise<T>): Promise<T> {
    return withSchoolLock(this.pool, organizationId, fn);
  }
}
