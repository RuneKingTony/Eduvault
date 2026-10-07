import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { sql } from 'kysely';
import type { RouteOutput, contract } from '@eduvault/api-contract';
import { KYSELY_TOKEN, type Database } from '../../common/db/database.module';

@Controller('health')
export class HealthController {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {}

  @Get()
  async check(): Promise<RouteOutput<typeof contract.health>> {
    try {
      await sql`SELECT 1`.execute(this.db);
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
    return { status: 'ok' };
  }
}
