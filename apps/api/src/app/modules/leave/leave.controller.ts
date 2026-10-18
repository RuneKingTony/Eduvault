import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  LEAVE_STAFF_ONLY_MESSAGE,
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
import { LeaveService } from './leave.service';

const routes = contract.leave;

@Controller()
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Get('me/leave')
  @StaffOnlyAuth(LEAVE_STAFF_ONLY_MESSAGE)
  mine(@Org() org: OrgContext): Promise<RouteOutput<typeof routes.me>> {
    return this.leave.mine(org);
  }

  @Post('leave')
  @StaffOnlyAuth(LEAVE_STAFF_ONLY_MESSAGE)
  create(
    @Org() org: OrgContext,
    @Body(zod(routes.create.body))
    body: Parameters<LeaveService['create']>[1]
  ): Promise<RouteOutput<typeof routes.create>> {
    return this.leave.create(org, body);
  }

  @Post('leave/:id/withdraw')
  @HttpCode(200)
  @StaffOnlyAuth(LEAVE_STAFF_ONLY_MESSAGE)
  withdraw(
    @Org() org: OrgContext,
    @Param(zod(routes.withdraw.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.withdraw>> {
    return this.leave.withdraw(org, params.id);
  }

  @Post('me/leave/seen')
  @HttpCode(200)
  @StaffOnlyAuth(LEAVE_STAFF_ONLY_MESSAGE)
  seen(
    @Org() org: OrgContext,
    @Body(zod(routes.seen.body))
    body: Parameters<LeaveService['markSeen']>[1]
  ): Promise<RouteOutput<typeof routes.seen>> {
    return this.leave.markSeen(org, body);
  }

  @Get('leave')
  @OrganizationAuth('leave', 'approve')
  list(
    @Org() org: OrgContext,
    @Query(zod(routes.list.query))
    query: Parameters<LeaveService['list']>[1]
  ): Promise<RouteOutput<typeof routes.list>> {
    return this.leave.list(org, query);
  }

  @Post('leave/:id/approve')
  @HttpCode(200)
  @OrganizationAuth('leave', 'approve')
  approve(
    @Org() org: OrgContext,
    @Param(zod(routes.approve.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.approve>> {
    return this.leave.approve(org, params.id);
  }

  @Post('leave/:id/decline')
  @HttpCode(200)
  @OrganizationAuth('leave', 'approve')
  decline(
    @Org() org: OrgContext,
    @Param(zod(routes.decline.params)) params: { id: string },
    @Body(zod(routes.decline.body)) body: { reason: string }
  ): Promise<RouteOutput<typeof routes.decline>> {
    return this.leave.decline(org, params.id, body.reason);
  }

  @Post('leave/:id/cancel')
  @HttpCode(200)
  @OrganizationAuth('leave', 'approve')
  cancel(
    @Org() org: OrgContext,
    @Param(zod(routes.cancel.params)) params: { id: string },
    @Body(zod(routes.cancel.body)) body: { reason: string }
  ): Promise<RouteOutput<typeof routes.cancel>> {
    return this.leave.cancel(org, params.id, body.reason);
  }
}
