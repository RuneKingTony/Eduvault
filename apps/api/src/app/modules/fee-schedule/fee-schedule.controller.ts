import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { FeeScheduleService } from './fee-schedule.service';

const routes = contract.feeSchedules;

@Controller('fee-schedules')
export class FeeScheduleController {
  constructor(private readonly fees: FeeScheduleService) {}

  @Get()
  @OrganizationAuth('feeSchedule', 'read')
  list(
    @Org() org: OrgContext,
    @Query(zod(routes.list.query)) query: { campusId?: string }
  ): Promise<RouteOutput<typeof routes.list>> {
    return this.fees.list(org, query.campusId);
  }

  @Get(':id')
  @OrganizationAuth('feeSchedule', 'read')
  get(
    @Org() org: OrgContext,
    @Param(zod(routes.get.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.get>> {
    return this.fees.get(org, params.id);
  }

  @Post()
  @OrganizationAuth('feeSchedule', 'create')
  create(
    @Org() org: OrgContext,
    @Body(zod(routes.create.body))
    body: Parameters<FeeScheduleService['create']>[1]
  ): Promise<RouteOutput<typeof routes.create>> {
    return this.fees.create(org, body);
  }

  @Patch(':id')
  @OrganizationAuth('feeSchedule', 'update')
  update(
    @Org() org: OrgContext,
    @Param(zod(routes.update.params)) params: { id: string },
    @Body(zod(routes.update.body))
    body: Parameters<FeeScheduleService['update']>[2]
  ): Promise<RouteOutput<typeof routes.update>> {
    return this.fees.update(org, params.id, body);
  }

  @Delete(':id')
  @OrganizationAuth('feeSchedule', 'delete')
  remove(
    @Org() org: OrgContext,
    @Param(zod(routes.remove.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.remove>> {
    return this.fees.remove(org, params.id);
  }
}
