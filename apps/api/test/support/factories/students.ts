import type { INestApplication } from '@nestjs/common';
import type { Request } from 'express';
import type { Student } from '@eduvault/api-contract';
import { AuthContextService } from '../../../src/app/common/auth';
import { StudentService } from '../../../src/app/modules/student/student.service';

/** The context OrganizationAuthGuard would build for this user's session. */
async function orgContextFor(app: INestApplication, actor: { cookie: string }) {
  const auth = app.get(AuthContextService);
  const req = {
    headers: { cookie: actor.cookie },
  } as unknown as Request;
  const session = await auth.resolveSession(req);
  const ctx = session && (await auth.resolveOrganization(session));
  if (!ctx) {
    throw new Error('The actor has no active school');
  }
  return ctx;
}

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
