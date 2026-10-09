import { Controller, Get, Query } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { PlatformAuth } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { PlatformAuditService } from './platform-audit.service';

const routes = contract.platform.audit;

@Controller('platform/audit')
export class PlatformAuditController {
  constructor(private readonly audit: PlatformAuditService) {}

  @Get()
  @PlatformAuth()
  list(
    @Query(zod(routes.list.query))
    query: Parameters<PlatformAuditService['list']>[0]
  ): Promise<RouteOutput<typeof routes.list>> {
    return this.audit.list(query);
  }
}
