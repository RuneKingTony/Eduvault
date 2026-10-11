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
import { AdmissionService } from './admission.service';
import { StudentService } from './student.service';

const routes = contract.students;

@Controller('students')
export class StudentController {
  constructor(
    private readonly students: StudentService,
    private readonly admissions: AdmissionService
  ) {}

  @Get()
  @OrganizationAuth('student', 'read')
  list(
    @Org() org: OrgContext,
    @Query(zod(routes.list.query))
    query: Parameters<StudentService['list']>[1]
  ): Promise<RouteOutput<typeof routes.list>> {
    return this.students.list(org, query);
  }

  @Get(':id')
  @OrganizationAuth('student', 'read')
  get(
    @Org() org: OrgContext,
    @Param(zod(routes.get.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.get>> {
    return this.students.get(org, params.id);
  }

  @Post()
  @OrganizationAuth('student', 'create')
  create(
    @Org() org: OrgContext,
    @Body(zod(routes.create.body))
    body: Parameters<AdmissionService['admit']>[1]
  ): Promise<RouteOutput<typeof routes.create>> {
    return this.admissions.admit(org, body);
  }

  @Patch(':id')
  @OrganizationAuth('student', 'update')
  update(
    @Org() org: OrgContext,
    @Param(zod(routes.update.params)) params: { id: string },
    @Body(zod(routes.update.body))
    body: Parameters<StudentService['update']>[2]
  ): Promise<RouteOutput<typeof routes.update>> {
    return this.students.update(org, params.id, body);
  }
}
