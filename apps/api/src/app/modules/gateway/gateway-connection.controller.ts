import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import {
  contract,
  type RouteOutput,
  type SaveGatewayConnection,
} from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { GatewayConnectionService } from './gateway-connection.service';
import { GatewayTestService } from './gateway-test.service';

const routes = contract.gateway;

@Controller('finance/gateway/monnify')
export class GatewayConnectionController {
  constructor(
    private readonly connection: GatewayConnectionService,
    private readonly tests: GatewayTestService
  ) {}

  @Get()
  @OrganizationAuth('wallet', 'manageGateway')
  get(@Org() org: OrgContext): Promise<RouteOutput<typeof routes.get>> {
    return this.connection.get(org);
  }

  @Put()
  @OrganizationAuth('wallet', 'manageGateway')
  save(
    @Org() org: OrgContext,
    @Body(zod(routes.save.body)) body: SaveGatewayConnection
  ): Promise<RouteOutput<typeof routes.save>> {
    return this.connection.save(org, body);
  }

  @Post('test')
  @HttpCode(200)
  @OrganizationAuth('wallet', 'manageGateway')
  test(@Org() org: OrgContext): Promise<RouteOutput<typeof routes.test>> {
    return this.tests.test(org);
  }
}
