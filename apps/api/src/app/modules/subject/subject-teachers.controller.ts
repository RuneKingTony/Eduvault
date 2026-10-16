import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { SubjectTeacherService } from './subject-teacher.service';

const routes = contract.subjectTeachers;

@Controller()
export class SubjectTeachersController {
  constructor(private readonly teachers: SubjectTeacherService) {}

  @Get('subject-teachers')
  @OrganizationAuth('subject', 'read')
  list(@Org() org: OrgContext): Promise<RouteOutput<typeof routes.list>> {
    return this.teachers.list(org);
  }

  @Post('subject-teachers/copy-from-previous-term')
  @OrganizationAuth('class', 'assignTeacher')
  copyFromPreviousTerm(
    @Org() org: OrgContext
  ): Promise<RouteOutput<typeof routes.copyFromPreviousTerm>> {
    return this.teachers.copyFromPreviousTerm(org);
  }

  @Put('classes/:id/subject-teachers/:subjectId')
  @OrganizationAuth('class', 'assignTeacher')
  assign(
    @Org() org: OrgContext,
    @Param(zod(routes.assign.params))
    params: { id: string; subjectId: string },
    @Body(zod(routes.assign.body))
    body: Parameters<SubjectTeacherService['assign']>[2]
  ): Promise<RouteOutput<typeof routes.assign>> {
    return this.teachers.assign(
      org,
      { classId: params.id, subjectId: params.subjectId },
      body
    );
  }

  @Delete('classes/:id/subject-teachers/:subjectId')
  @OrganizationAuth('class', 'assignTeacher')
  remove(
    @Org() org: OrgContext,
    @Param(zod(routes.remove.params))
    params: { id: string; subjectId: string }
  ): Promise<RouteOutput<typeof routes.remove>> {
    return this.teachers.remove(org, params.id, params.subjectId);
  }
}
