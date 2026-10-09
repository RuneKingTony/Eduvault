import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import {
  CurrentSession,
  PlatformAuth,
  type SessionContext,
} from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { PlatformService } from './platform.service';

const routes = contract.platform.schools;

@Controller('platform/schools')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get()
  @PlatformAuth()
  list(
    @Query(zod(routes.list.query))
    query: Parameters<PlatformService['listSchools']>[0]
  ): Promise<RouteOutput<typeof routes.list>> {
    return this.platform.listSchools(query);
  }

  @Post()
  @PlatformAuth()
  create(
    @CurrentSession() session: SessionContext,
    @Body(zod(routes.create.body))
    body: Parameters<PlatformService['createSchool']>[1]
  ): Promise<RouteOutput<typeof routes.create>> {
    return this.platform.createSchool(session.user, body);
  }

  @Get('options')
  @PlatformAuth()
  options(): Promise<RouteOutput<typeof routes.options>> {
    return this.platform.listSchoolOptions();
  }

  @Get(':id')
  @PlatformAuth()
  get(
    @Param(zod(routes.get.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.get>> {
    return this.platform.getSchool(params.id);
  }

  @Get(':id/members')
  @PlatformAuth()
  members(
    @Param(zod(routes.members.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.members>> {
    return this.platform.listMembers(params.id);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  @PlatformAuth()
  suspend(
    @CurrentSession() session: SessionContext,
    @Param(zod(routes.suspend.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.suspend>> {
    return this.platform.suspend(session.user, params.id);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @PlatformAuth()
  reactivate(
    @CurrentSession() session: SessionContext,
    @Param(zod(routes.reactivate.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.reactivate>> {
    return this.platform.reactivate(session.user, params.id);
  }

  @Put(':id/owner')
  @PlatformAuth()
  replaceOwner(
    @CurrentSession() session: SessionContext,
    @Param(zod(routes.replaceOwner.params)) params: { id: string },
    @Body(zod(routes.replaceOwner.body))
    body: Parameters<PlatformService['replaceOwner']>[2]
  ): Promise<RouteOutput<typeof routes.replaceOwner>> {
    return this.platform.replaceOwner(session.user, params.id, body);
  }
}
