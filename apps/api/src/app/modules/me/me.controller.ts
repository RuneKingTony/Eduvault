import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import {
  CurrentSession,
  Org,
  OrganizationAuth,
  SessionAuth,
  type OrgContext,
  type SessionContext,
} from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { MeService } from './me.service';

const routes = contract.me;

@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  /** Needs a session only, so it answers before a school is chosen. */
  @Get()
  @SessionAuth({ allowTemporaryPassword: true })
  get(
    @CurrentSession() session: SessionContext
  ): Promise<RouteOutput<typeof routes.get>> {
    return this.me.get(session);
  }

  @Get('permissions')
  @OrganizationAuth()
  permissions(@Org() org: OrgContext): RouteOutput<typeof routes.permissions> {
    return this.me.permissions(org);
  }

  @Post('password')
  @HttpCode(204)
  @SessionAuth({ allowTemporaryPassword: true })
  setPassword(
    @CurrentSession() session: SessionContext,
    @Body(zod(routes.setPassword.body))
    body: { newPassword: string }
  ): Promise<RouteOutput<typeof routes.setPassword>> {
    return this.me.setPassword(session, body.newPassword);
  }
}
