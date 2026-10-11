import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { LifecycleService } from './lifecycle.service';
import { StudentLoginService } from './student-login.service';

const routes = contract.students;

@Controller('students')
export class LifecycleController {
  constructor(
    private readonly lifecycle: LifecycleService,
    private readonly logins: StudentLoginService
  ) {}

  @Post(':id/not-seen')
  @OrganizationAuth('student', 'markAway')
  markAway(
    @Org() org: OrgContext,
    @Param(zod(routes.markAway.params)) params: { id: string },
    @Body(zod(routes.markAway.body))
    body: Parameters<LifecycleService['markAway']>[2]
  ): Promise<RouteOutput<typeof routes.markAway>> {
    return this.lifecycle.markAway(org, params.id, body);
  }

  @Post(':id/back-in-school')
  @OrganizationAuth('student', 'markAway')
  backInSchool(
    @Org() org: OrgContext,
    @Param(zod(routes.backInSchool.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.backInSchool>> {
    return this.lifecycle.backInSchool(org, params.id);
  }

  @Post(':id/leave')
  @OrganizationAuth('student', 'archive')
  leave(
    @Org() org: OrgContext,
    @Param(zod(routes.leave.params)) params: { id: string },
    @Body(zod(routes.leave.body))
    body: Parameters<LifecycleService['leave']>[2]
  ): Promise<RouteOutput<typeof routes.leave>> {
    return this.lifecycle.leave(org, params.id, body);
  }

  @Post(':id/undo-leaving')
  @OrganizationAuth('student', 'archive')
  undoLeaving(
    @Org() org: OrgContext,
    @Param(zod(routes.undoLeaving.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.undoLeaving>> {
    return this.lifecycle.undoLeaving(org, params.id);
  }

  @Get(':id/next-term-classes')
  @OrganizationAuth('enrollment', 'place')
  nextTermClasses(
    @Org() org: OrgContext,
    @Param(zod(routes.nextTermClasses.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.nextTermClasses>> {
    return this.lifecycle.nextTermClasses(org, params.id);
  }

  @Post(':id/placements')
  @OrganizationAuth('enrollment', 'place')
  place(
    @Org() org: OrgContext,
    @Param(zod(routes.place.params)) params: { id: string },
    @Body(zod(routes.place.body))
    body: Parameters<LifecycleService['place']>[2]
  ): Promise<RouteOutput<typeof routes.place>> {
    return this.lifecycle.place(org, params.id, body);
  }

  @Post(':id/reset-login')
  @OrganizationAuth('student', 'update')
  resetLogin(
    @Org() org: OrgContext,
    @Param(zod(routes.resetLogin.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.resetLogin>> {
    return this.logins.resetLogin(org, params.id);
  }
}
