import { Body, Controller, Get, Post } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { NewSchoolYearService } from './new-school-year.service';

const routes = contract.students;

/** Listed before `StudentController` in the module so `new-school-year` is never read as a student id. */
@Controller('students/new-school-year')
export class NewSchoolYearController {
  constructor(private readonly newSchoolYear: NewSchoolYearService) {}

  @Get()
  @OrganizationAuth('enrollment', 'place')
  preview(
    @Org() org: OrgContext
  ): Promise<RouteOutput<typeof routes.newSchoolYearPreview>> {
    return this.newSchoolYear.preview(org);
  }

  @Post()
  @OrganizationAuth('enrollment', 'place')
  start(
    @Org() org: OrgContext,
    @Body(zod(routes.startNewSchoolYear.body))
    body: Parameters<NewSchoolYearService['start']>[1]
  ): Promise<RouteOutput<typeof routes.startNewSchoolYear>> {
    return this.newSchoolYear.start(org, body);
  }
}
