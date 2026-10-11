import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ANNOUNCEMENT_STAFF_ONLY_MESSAGE,
  contract,
  type RouteOutput,
} from '@eduvault/api-contract';
import {
  Org,
  OrganizationAuth,
  StaffOnlyAuth,
  type OrgContext,
} from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { AnnouncementService } from './announcement.service';

const routes = contract.announcements;

@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementService) {}

  @Get()
  @OrganizationAuth('announcement', 'read')
  list(
    @Org() org: OrgContext,
    @Query(zod(routes.list.query))
    query: Parameters<AnnouncementService['list']>[1]
  ): Promise<RouteOutput<typeof routes.list>> {
    return this.announcements.list(org, query);
  }

  @Get('feed')
  @StaffOnlyAuth(ANNOUNCEMENT_STAFF_ONLY_MESSAGE)
  feed(
    @Org() org: OrgContext,
    @Query(zod(routes.feed.query))
    query: Parameters<AnnouncementService['feed']>[1]
  ): Promise<RouteOutput<typeof routes.feed>> {
    return this.announcements.feed(org, query);
  }

  @Get(':id')
  @OrganizationAuth('announcement', 'read')
  get(
    @Org() org: OrgContext,
    @Param(zod(routes.get.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.get>> {
    return this.announcements.get(org, params.id);
  }

  @Post()
  @OrganizationAuth('announcement', 'create')
  create(
    @Org() org: OrgContext,
    @Body(zod(routes.create.body))
    body: Parameters<AnnouncementService['create']>[1]
  ): Promise<RouteOutput<typeof routes.create>> {
    return this.announcements.create(org, body);
  }

  @Patch(':id')
  @OrganizationAuth('announcement', 'update')
  update(
    @Org() org: OrgContext,
    @Param(zod(routes.update.params)) params: { id: string },
    @Body(zod(routes.update.body))
    body: Parameters<AnnouncementService['update']>[2]
  ): Promise<RouteOutput<typeof routes.update>> {
    return this.announcements.update(org, params.id, body);
  }

  @Post(':id/publish')
  @OrganizationAuth('announcement', 'update')
  publish(
    @Org() org: OrgContext,
    @Param(zod(routes.publish.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.publish>> {
    return this.announcements.publish(org, params.id);
  }

  @Post(':id/withdraw')
  @OrganizationAuth('announcement', 'update')
  withdraw(
    @Org() org: OrgContext,
    @Param(zod(routes.withdraw.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.withdraw>> {
    return this.announcements.withdraw(org, params.id);
  }

  @Put(':id/pin')
  @OrganizationAuth('announcement', 'update')
  pin(
    @Org() org: OrgContext,
    @Param(zod(routes.pin.params)) params: { id: string },
    @Body(zod(routes.pin.body)) body: { pinned: boolean }
  ): Promise<RouteOutput<typeof routes.pin>> {
    return this.announcements.pin(org, params.id, body.pinned);
  }
}
