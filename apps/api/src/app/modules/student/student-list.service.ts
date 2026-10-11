import { Injectable } from '@nestjs/common';
import type { RouteQuery, StudentList, contract } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { NewSchoolYearService } from './new-school-year.service';
import { StudentService } from './student.service';

@Injectable()
export class StudentListService {
  constructor(
    private readonly students: StudentService,
    private readonly newSchoolYear: NewSchoolYearService
  ) {}

  async list(
    ctx: OrgContext,
    query: RouteQuery<typeof contract.students.list>
  ): Promise<StudentList> {
    const [list, startYear] = await Promise.all([
      this.students.list(ctx, query),
      this.newSchoolYear.offer(ctx),
    ]);
    return {
      ...list,
      startYear:
        startYear === null
          ? null
          : { targetYearId: startYear.targetYearId, name: startYear.name },
    };
  }
}
