import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { SubjectService } from './subject.service';

const routes = contract.subjects;

@Controller('subjects')
export class SubjectsController {
  constructor(private readonly subjects: SubjectService) {}

  @Get()
  @OrganizationAuth('subject', 'read')
  list(
    @Org() org: OrgContext,
    @Query(zod(routes.list.query))
    query: Parameters<SubjectService['list']>[1]
  ): Promise<RouteOutput<typeof routes.list>> {
    return this.subjects.list(org, query);
  }

  @Post()
  @OrganizationAuth('subject', 'create')
  create(
    @Org() org: OrgContext,
    @Body(zod(routes.create.body))
    body: Parameters<SubjectService['create']>[1]
  ): Promise<RouteOutput<typeof routes.create>> {
    return this.subjects.create(org, body);
  }

  @Patch(':id')
  @OrganizationAuth('subject', 'update')
  update(
    @Org() org: OrgContext,
    @Param(zod(routes.update.params)) params: { id: string },
    @Body(zod(routes.update.body))
    body: Parameters<SubjectService['update']>[2]
  ): Promise<RouteOutput<typeof routes.update>> {
    return this.subjects.update(org, params.id, body);
  }
}
