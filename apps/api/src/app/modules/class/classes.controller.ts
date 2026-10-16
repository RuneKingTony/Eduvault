import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { ClassService } from './class.service';

const routes = contract.classes;

@Controller('classes')
export class ClassesController {
  constructor(private readonly classes: ClassService) {}

  @Get()
  @OrganizationAuth('class', 'read')
  list(
    @Org() org: OrgContext,
    @Query(zod(routes.list.query))
    query: Parameters<ClassService['list']>[1]
  ): Promise<RouteOutput<typeof routes.list>> {
    return this.classes.list(org, query);
  }

  @Get(':id')
  @OrganizationAuth('class', 'read')
  get(
    @Org() org: OrgContext,
    @Param(zod(routes.get.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.get>> {
    return this.classes.get(org, params.id);
  }

  @Post()
  @OrganizationAuth('class', 'create')
  create(
    @Org() org: OrgContext,
    @Body(zod(routes.create.body))
    body: Parameters<ClassService['create']>[1]
  ): Promise<RouteOutput<typeof routes.create>> {
    return this.classes.create(org, body);
  }

  @Patch(':id')
  @OrganizationAuth('class', 'update')
  update(
    @Org() org: OrgContext,
    @Param(zod(routes.update.params)) params: { id: string },
    @Body(zod(routes.update.body))
    body: Parameters<ClassService['update']>[2]
  ): Promise<RouteOutput<typeof routes.update>> {
    return this.classes.update(org, params.id, body);
  }

  @Get(':id/teacher-candidates')
  @OrganizationAuth('class', 'assignTeacher')
  teacherCandidates(
    @Org() org: OrgContext,
    @Param(zod(routes.teacherCandidates.params)) params: { id: string },
    @Query(zod(routes.teacherCandidates.query))
    query: Parameters<ClassService['teacherCandidates']>[2]
  ): Promise<RouteOutput<typeof routes.teacherCandidates>> {
    return this.classes.teacherCandidates(org, params.id, query);
  }

  @Post(':id/teachers')
  @OrganizationAuth('class', 'assignTeacher')
  assignTeacher(
    @Org() org: OrgContext,
    @Param(zod(routes.assignTeacher.params)) params: { id: string },
    @Body(zod(routes.assignTeacher.body))
    body: Parameters<ClassService['assignTeacher']>[2]
  ): Promise<RouteOutput<typeof routes.assignTeacher>> {
    return this.classes.assignTeacher(org, params.id, body);
  }

  @Delete(':id/teachers/:userId')
  @OrganizationAuth('class', 'assignTeacher')
  removeTeacher(
    @Org() org: OrgContext,
    @Param(zod(routes.removeTeacher.params))
    params: { id: string; userId: string }
  ): Promise<RouteOutput<typeof routes.removeTeacher>> {
    return this.classes.removeTeacher(org, params.id, params.userId);
  }
}
