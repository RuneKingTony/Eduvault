import { Controller, Get, Query } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { SubjectService } from './subject.service';

const routes = contract.levelSubjects;

@Controller('level-subjects')
export class LevelSubjectsController {
  constructor(private readonly subjects: SubjectService) {}

  @Get()
  @OrganizationAuth('subject', 'read')
  list(
    @Org() org: OrgContext,
    @Query(zod(routes.list.query))
    query: Parameters<SubjectService['levelSubjects']>[1]
  ): Promise<RouteOutput<typeof routes.list>> {
    return this.subjects.levelSubjects(org, query);
  }
}
