import { Controller, Get, Query } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { AdmissionService } from './admission.service';

const routes = contract.admissions;

@Controller('admissions')
export class AdmissionsController {
  constructor(private readonly admissions: AdmissionService) {}

  @Get('preview')
  @OrganizationAuth('student', 'create')
  preview(@Org() org: OrgContext): Promise<RouteOutput<typeof routes.preview>> {
    return this.admissions.preview(org);
  }

  @Get('duplicates')
  @OrganizationAuth('student', 'create')
  duplicates(
    @Org() org: OrgContext,
    @Query(zod(routes.duplicates.query))
    query: Parameters<AdmissionService['duplicates']>[1]
  ): Promise<RouteOutput<typeof routes.duplicates>> {
    return this.admissions.duplicates(org, query);
  }
}
