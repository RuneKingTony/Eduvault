import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { SchoolService } from './school.service';

const routes = contract.school;

@Controller('school')
export class SchoolController {
  constructor(private readonly school: SchoolService) {}

  @Get('handover-candidates')
  @OrganizationAuth('organization', 'update')
  handoverCandidates(
    @Org() org: OrgContext
  ): Promise<RouteOutput<typeof routes.handoverCandidates>> {
    return this.school.handoverCandidates(org);
  }

  @Post('handover')
  @OrganizationAuth('organization', 'update')
  handover(
    @Org() org: OrgContext,
    @Body(zod(routes.handover.body)) body: { userId: string }
  ): Promise<RouteOutput<typeof routes.handover>> {
    return this.school.handover(org, body.userId);
  }

  @Get('deletable')
  @OrganizationAuth('organization', 'delete')
  deletable(
    @Org() org: OrgContext
  ): Promise<RouteOutput<typeof routes.deletable>> {
    return this.school.deletable(org);
  }

  @Delete()
  @OrganizationAuth('organization', 'delete')
  remove(
    @Org() org: OrgContext,
    @Body(zod(routes.remove.body)) body: { confirmName: string }
  ): Promise<RouteOutput<typeof routes.remove>> {
    return this.school.remove(org, body.confirmName);
  }
}
