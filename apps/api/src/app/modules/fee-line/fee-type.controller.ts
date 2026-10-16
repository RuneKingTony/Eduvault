import { Body, Controller, Get, Post } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { FeeTypeService } from './fee-type.service';

const routes = contract.feeTypes;

@Controller('fee-types')
export class FeeTypeController {
  constructor(private readonly feeTypes: FeeTypeService) {}

  @Get()
  @OrganizationAuth('feeLine', 'read')
  list(@Org() org: OrgContext): Promise<RouteOutput<typeof routes.list>> {
    return this.feeTypes.list(org);
  }

  @Post()
  @OrganizationAuth('feeLine', 'create')
  create(
    @Org() org: OrgContext,
    @Body(zod(routes.create.body))
    body: Parameters<FeeTypeService['create']>[1]
  ): Promise<RouteOutput<typeof routes.create>> {
    return this.feeTypes.create(org, body);
  }
}
