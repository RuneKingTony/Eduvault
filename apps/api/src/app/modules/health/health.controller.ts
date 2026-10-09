import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import type { RouteOutput, contract } from '@eduvault/api-contract';
import { DatabaseHealth } from '../../common/db/database-health';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseHealth) {}

  @Get()
  async check(): Promise<RouteOutput<typeof contract.health>> {
    if (!(await this.database.ping())) {
      throw new ServiceUnavailableException('Database unavailable');
    }
    return { status: 'ok' };
  }
}
