import { Controller, Get, Query } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { CalendarService } from './calendar.service';

const routes = contract.calendar;

@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get('current')
  @OrganizationAuth()
  current(@Org() org: OrgContext): Promise<RouteOutput<typeof routes.current>> {
    return this.calendar.current(org);
  }

  @Get('days-off')
  @OrganizationAuth()
  daysOff(
    @Org() org: OrgContext,
    @Query(zod(routes.daysOff.query)) query: { limit: number }
  ): Promise<RouteOutput<typeof routes.daysOff>> {
    return this.calendar.daysOff(org, query.limit);
  }
}
