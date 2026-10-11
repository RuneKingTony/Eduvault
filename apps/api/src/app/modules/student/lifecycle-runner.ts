import { Injectable, NotFoundException } from '@nestjs/common';
import {
  STUDENT_NOT_FOUND_MESSAGE,
  type StudentDetail,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { SchoolLock } from '../../common/db/school-lock';
import {
  LifecycleRepository,
  type LifecycleStudent,
  type LifecycleTx,
} from './lifecycle.repository';
import { StudentService } from './student.service';

@Injectable()
export class LifecycleRunner {
  constructor(
    private readonly lifecycle: LifecycleRepository,
    private readonly students: StudentService,
    private readonly lock: SchoolLock
  ) {}

  async read<T>(
    ctx: OrgContext,
    id: string,
    work: (tx: LifecycleTx) => Promise<T>
  ): Promise<T> {
    await this.students.assertVisible(ctx, id);
    return this.lifecycle.transaction(work);
  }

  async run(
    ctx: OrgContext,
    id: string,
    work: (tx: LifecycleTx, student: LifecycleStudent) => Promise<void>
  ): Promise<StudentDetail> {
    await this.students.assertVisible(ctx, id);
    await this.lock.run(ctx.organizationId, () =>
      this.lifecycle.transaction(async (tx) => {
        const student = await tx.lockStudent(ctx.organizationId, id);
        if (student === undefined) {
          throw new NotFoundException(STUDENT_NOT_FOUND_MESSAGE);
        }
        await work(tx, student);
      })
    );
    return this.students.get(ctx, id);
  }
}
