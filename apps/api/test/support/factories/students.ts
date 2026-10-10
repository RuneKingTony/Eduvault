import type { INestApplication } from '@nestjs/common';
import type { Student } from '@eduvault/api-contract';
import { StudentService } from '../../../src/app/modules/student/student.service';
import { orgContextFor } from './org-context';

interface StudentInput {
  campusId?: string;
  fullName?: string;
  admissionNumber?: string;
}

let sequence = 0;

export async function createStudent(
  app: INestApplication,
  actor: { cookie: string },
  input: StudentInput = {}
): Promise<Student> {
  sequence += 1;
  const ctx = await orgContextFor(app, actor);
  return app.get(StudentService, { strict: false }).create(ctx, {
    campusId: input.campusId,
    fullName: input.fullName ?? `Student ${sequence}`,
    admissionNumber: input.admissionNumber ?? `ADM-${sequence}`,
  });
}
