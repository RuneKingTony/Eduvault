import { Controller, Get, Param, Query } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { StudentAccountService } from './student-account.service';

const routes = contract.studentAccounts;

@Controller('finance')
export class StudentAccountController {
  constructor(private readonly accounts: StudentAccountService) {}

  @Get('balances')
  @OrganizationAuth(['invoice:read', 'payment:read'])
  balances(
    @Org() org: OrgContext,
    @Query(zod(routes.balances.query))
    query: Parameters<StudentAccountService['balances']>[1]
  ): Promise<RouteOutput<typeof routes.balances>> {
    return this.accounts.balances(org, query);
  }

  @Get('students/:studentId/statement')
  @OrganizationAuth(['invoice:read', 'payment:read'])
  statement(
    @Org() org: OrgContext,
    @Param(zod(routes.statement.params)) params: { studentId: string },
    @Query(zod(routes.statement.query))
    query: Parameters<StudentAccountService['statement']>[2]
  ): Promise<RouteOutput<typeof routes.statement>> {
    return this.accounts.statement(org, params.studentId, query);
  }

  @Get('guardians/:guardianId/statement')
  @OrganizationAuth(['invoice:read', 'payment:read'])
  guardianStatement(
    @Org() org: OrgContext,
    @Param(zod(routes.guardianStatement.params))
    params: { guardianId: string }
  ): Promise<RouteOutput<typeof routes.guardianStatement>> {
    return this.accounts.guardianStatement(org, params.guardianId);
  }
}
