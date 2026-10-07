import { Controller, Get } from '@nestjs/common';
import type { RouteOutput, contract } from '@eduvault/api-contract';
import {
  CurrentSession,
  SessionAuth,
  type SessionContext,
} from '../../common/auth';

@Controller('me')
export class MeController {
  /** Needs a session only, so it answers before a school is chosen. */
  @Get()
  @SessionAuth()
  get(
    @CurrentSession() session: SessionContext
  ): RouteOutput<typeof contract.me> {
    return {
      user: session.user,
      activeOrganizationId: session.activeOrganizationId,
      activeCampusId: session.activeTeamId,
    };
  }
}
