import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { ElectiveService } from './elective.service';

const routes = contract.electives;

@Controller('electives')
export class ElectivesController {
  constructor(private readonly electives: ElectiveService) {}

  @Get()
  @OrganizationAuth({ allOf: ['subject:read', 'student:read'] })
  list(
    @Org() org: OrgContext,
    @Query(zod(routes.list.query))
    query: Parameters<ElectiveService['list']>[1]
  ): Promise<RouteOutput<typeof routes.list>> {
    return this.electives.list(org, query);
  }

  @Put(':subjectId')
  @OrganizationAuth('subject', 'update')
  set(
    @Org() org: OrgContext,
    @Param(zod(routes.set.params)) params: { subjectId: string },
    @Body(zod(routes.set.body))
    body: Parameters<ElectiveService['set']>[2]
  ): Promise<RouteOutput<typeof routes.set>> {
    return this.electives.set(org, params.subjectId, body);
  }
}
