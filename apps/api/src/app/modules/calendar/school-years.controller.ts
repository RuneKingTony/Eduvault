import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { CalendarService } from './calendar.service';

const routes = contract.schoolYears;

@Controller('school-years')
export class SchoolYearsController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  @OrganizationAuth('session', 'read')
  list(
    @Org() org: OrgContext,
    @Query(zod(routes.list.query)) query: { page: number }
  ): Promise<RouteOutput<typeof routes.list>> {
    return this.calendar.list(org, query.page);
  }

  @Get(':id')
  @OrganizationAuth('session', 'read')
  get(
    @Org() org: OrgContext,
    @Param(zod(routes.get.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.get>> {
    return this.calendar.get(org, params.id);
  }

  @Post()
  @OrganizationAuth('session', 'create')
  create(
    @Org() org: OrgContext,
    @Body(zod(routes.create.body))
    body: Parameters<CalendarService['create']>[1]
  ): Promise<RouteOutput<typeof routes.create>> {
    return this.calendar.create(org, body);
  }

  @Delete(':id')
  @OrganizationAuth('session', 'update')
  remove(
    @Org() org: OrgContext,
    @Param(zod(routes.remove.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.remove>> {
    return this.calendar.remove(org, params.id);
  }
}
