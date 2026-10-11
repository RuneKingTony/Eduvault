import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { GuardianService } from './guardian.service';

const routes = contract.students;

@Controller('students')
export class StudentGuardiansController {
  constructor(private readonly guardians: GuardianService) {}

  @Get(':id/guardians')
  @OrganizationAuth('guardian', 'read')
  list(
    @Org() org: OrgContext,
    @Param(zod(routes.guardians.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.guardians>> {
    return this.guardians.linksOf(org, params.id);
  }

  @Post(':id/guardians')
  @OrganizationAuth('guardian', 'link')
  link(
    @Org() org: OrgContext,
    @Param(zod(routes.linkGuardian.params)) params: { id: string },
    @Body(zod(routes.linkGuardian.body))
    body: Parameters<GuardianService['link']>[2]
  ): Promise<RouteOutput<typeof routes.linkGuardian>> {
    return this.guardians.link(org, params.id, body);
  }

  @Patch(':id/guardians/:guardianId')
  @OrganizationAuth('guardian', 'link')
  updateLink(
    @Org() org: OrgContext,
    @Param(zod(routes.updateGuardianLink.params))
    params: { id: string; guardianId: string },
    @Body(zod(routes.updateGuardianLink.body))
    body: Parameters<GuardianService['updateLink']>[2]
  ): Promise<RouteOutput<typeof routes.updateGuardianLink>> {
    return this.guardians.updateLink(
      org,
      { studentId: params.id, guardianId: params.guardianId },
      body
    );
  }

  @Delete(':id/guardians/:guardianId')
  @OrganizationAuth('guardian', 'link')
  unlink(
    @Org() org: OrgContext,
    @Param(zod(routes.unlinkGuardian.params))
    params: { id: string; guardianId: string }
  ): Promise<RouteOutput<typeof routes.unlinkGuardian>> {
    return this.guardians.unlink(org, {
      studentId: params.id,
      guardianId: params.guardianId,
    });
  }
}
