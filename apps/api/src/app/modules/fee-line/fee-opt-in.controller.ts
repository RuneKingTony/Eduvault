import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import {
  contract,
  type FeeOptInsQuery,
  type RouteOutput,
  type SetFeeOptInsInput,
} from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { FeeOptionService } from './fee-option.service';

const routes = contract.feeOptIns;

@Controller('fee-types/:feeTypeId/opt-ins')
export class FeeOptInController {
  constructor(private readonly options: FeeOptionService) {}

  @Get()
  @OrganizationAuth({ allOf: ['feeLine:read', 'student:read'] })
  list(
    @Org() org: OrgContext,
    @Param(zod(routes.list.params)) params: { feeTypeId: string },
    @Query(zod(routes.list.query))
    query: FeeOptInsQuery
  ): Promise<RouteOutput<typeof routes.list>> {
    return this.options.roster(org, params.feeTypeId, query);
  }

  @Put()
  @OrganizationAuth('feeLine', 'update')
  set(
    @Org() org: OrgContext,
    @Param(zod(routes.set.params)) params: { feeTypeId: string },
    @Body(zod(routes.set.body))
    body: SetFeeOptInsInput
  ): Promise<RouteOutput<typeof routes.set>> {
    return this.options.setMany(org, params.feeTypeId, body);
  }
}
