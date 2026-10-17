import { Body, Controller, Param, Put } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { SubjectService } from './subject.service';

const routes = contract.levelSubjects;

@Controller('class-levels')
export class ClassLevelSubjectsController {
  constructor(private readonly subjects: SubjectService) {}

  @Put(':id/subjects')
  @OrganizationAuth('subject', 'update')
  replace(
    @Org() org: OrgContext,
    @Param(zod(routes.replace.params)) params: { id: string },
    @Body(zod(routes.replace.body))
    body: Parameters<SubjectService['replaceLevelSubjects']>[2]
  ): Promise<RouteOutput<typeof routes.replace>> {
    return this.subjects.replaceLevelSubjects(org, params.id, body);
  }
}
