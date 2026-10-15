import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { MoneyAccountService } from './money-account.service';

const routes = contract.moneyAccounts;

@Controller('finance/money-accounts')
export class MoneyAccountController {
  constructor(private readonly accounts: MoneyAccountService) {}

  @Get()
  @OrganizationAuth('moneyAccount', 'read')
  list(@Org() org: OrgContext): Promise<RouteOutput<typeof routes.list>> {
    return this.accounts.list(org);
  }

  @Get(':id/cash-book')
  @OrganizationAuth('moneyAccount', 'read')
  cashBook(
    @Org() org: OrgContext,
    @Param(zod(routes.cashBook.params)) params: { id: string },
    @Query(zod(routes.cashBook.query))
    query: Parameters<MoneyAccountService['cashBook']>[2]
  ): Promise<RouteOutput<typeof routes.cashBook>> {
    return this.accounts.cashBook(org, params.id, query);
  }

  @Post()
  @OrganizationAuth('moneyAccount', 'create')
  create(
    @Org() org: OrgContext,
    @Body(zod(routes.create.body))
    body: Parameters<MoneyAccountService['create']>[1]
  ): Promise<RouteOutput<typeof routes.create>> {
    return this.accounts.create(org, body);
  }

  @Patch(':id')
  @OrganizationAuth('moneyAccount', 'update')
  update(
    @Org() org: OrgContext,
    @Param(zod(routes.update.params)) params: { id: string },
    @Body(zod(routes.update.body))
    body: Parameters<MoneyAccountService['update']>[2]
  ): Promise<RouteOutput<typeof routes.update>> {
    return this.accounts.update(org, params.id, body);
  }
}
