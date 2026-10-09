import { Body, Controller, Get, Post } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { PlatformAuth } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { PlatformService } from './platform.service';

const routes = contract.platform.schools;

@Controller('platform/schools')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get()
  @PlatformAuth()
  list(): Promise<RouteOutput<typeof routes.list>> {
    return this.platform.listSchools();
  }

  @Post()
  @PlatformAuth()
  create(
    @Body(zod(routes.create.body))
    body: Parameters<PlatformService['createSchool']>[0]
  ): Promise<RouteOutput<typeof routes.create>> {
    return this.platform.createSchool(body);
  }
}
