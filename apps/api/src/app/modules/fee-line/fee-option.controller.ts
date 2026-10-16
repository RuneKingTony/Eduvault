import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { FeeOptionService } from './fee-option.service';

const routes = contract.feeOptions;

@Controller('students/:studentId/fee-options')
export class FeeOptionController {
  constructor(private readonly options: FeeOptionService) {}

  @Get()
  @OrganizationAuth('feeLine', 'read')
  list(
    @Org() org: OrgContext,
    @Param(zod(routes.list.params)) params: { studentId: string },
    @Query(zod(routes.list.query)) query: { sessionId?: string }
  ): Promise<RouteOutput<typeof routes.list>> {
    return this.options.list(org, params.studentId, query.sessionId);
  }

  @Put(':feeTypeId')
  @OrganizationAuth('feeLine', 'update')
  set(
    @Org() org: OrgContext,
    @Param(zod(routes.set.params))
    params: Parameters<FeeOptionService['set']>[1],
    @Body(zod(routes.set.body))
    body: Parameters<FeeOptionService['set']>[2]
  ): Promise<RouteOutput<typeof routes.set>> {
    return this.options.set(org, params, body);
  }
}
