import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { KYSELY_TOKEN, type Database } from './tokens';

@Injectable()
export class DatabaseHealth {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {}

  async ping(): Promise<boolean> {
    try {
      await sql`SELECT 1`.execute(this.db);
      return true;
    } catch {
      return false;
    }
  }
}
