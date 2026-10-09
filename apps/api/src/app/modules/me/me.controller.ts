import { Controller, Get } from '@nestjs/common';
import type { RouteOutput, contract } from '@eduvault/api-contract';
import {
  CurrentSession,
  Org,
  OrganizationAuth,
  SessionAuth,
  type OrgContext,
  type SessionContext,
} from '../../common/auth';

@Controller('me')
export class MeController {
  /** Needs a session only, so it answers before a school is chosen. */
  @Get()
  @SessionAuth()
  get(
    @CurrentSession() session: SessionContext
  ): RouteOutput<typeof contract.me.get> {
    return {
      user: session.user,
      activeOrganizationId: session.activeOrganizationId,
      activeCampusId: session.activeTeamId,
    };
  }

  @Get('permissions')
  @OrganizationAuth()
  permissions(
    @Org() org: OrgContext
  ): RouteOutput<typeof contract.me.permissions> {
    return {
      organizationId: org.organizationId,
      roles: org.roles,
      permissions: org.permissions,
      campusScope: org.campusScope,
      classScope: org.classScope,
      acting: org.acting,
    };
  }
}
