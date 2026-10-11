import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  contract,
  type GraduateClassInput,
  type RouteOutput,
} from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { GraduationService } from './graduation.service';

const routes = contract.classes;

/** Lives in the student module so class code never imports student lifecycle code. */
@Controller('classes')
export class GraduationController {
  constructor(private readonly graduation: GraduationService) {}

  @Post(':id/graduate')
  @OrganizationAuth('student', 'archive')
  graduate(
    @Org() org: OrgContext,
    @Param(zod(routes.graduate.params)) params: { id: string },
    @Body(zod(routes.graduate.body))
    body: GraduateClassInput
  ): Promise<RouteOutput<typeof routes.graduate>> {
    return this.graduation.graduate(org, params.id, body);
  }
}
