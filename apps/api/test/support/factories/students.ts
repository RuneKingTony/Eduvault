import type { INestApplication } from '@nestjs/common';
import type {
  AdmitStudentResult,
  GuardianDraft,
  LoginCredential,
} from '@eduvault/api-contract';
import { ClassService } from '../../../src/app/modules/class/class.service';
import { AdmissionRepository } from '../../../src/app/modules/student/admission.repository';
import { AdmitWithAccountService } from '../../../src/app/modules/student/admit-with-account.service';
import { createClass } from './classes';
import { createSchoolYear } from './calendar';
import { orgContextFor } from './org-context';

interface StudentInput {
  campusId: string;
  firstName?: string;
  lastName?: string;
  gender?: 'F' | 'M';
  dateOfBirth?: string;
  classArmId?: string;
  guardians?: GuardianDraft[];
}

type CreatedStudent = AdmitStudentResult['student'] & {
  logins: LoginCredential[];
};

let sequence = 0;

export async function ensureCurrentTerm(
  app: INestApplication,
  actor: { cookie: string }
): Promise<void> {
  const ctx = await orgContextFor(app, actor);
  const admissions = app.get(AdmissionRepository, { strict: false });
  if ((await admissions.currentTerm(ctx.organizationId)) === undefined) {
    await createSchoolYear(app, actor);
  }
}

export async function ensureClass(
  app: INestApplication,
  actor: { cookie: string },
  campusId: string
): Promise<string> {
  const ctx = await orgContextFor(app, actor);
  const [existing] = await app
    .get(ClassService, { strict: false })
    .list(ctx, { campusId, status: 'active' });
  return existing?.id ?? (await createClass(app, actor, { campusId })).id;
}

export async function createStudent(
  app: INestApplication,
  actor: { cookie: string },
  input: StudentInput
): Promise<CreatedStudent> {
  sequence += 1;
  await ensureCurrentTerm(app, actor);
  const classArmId =
    input.classArmId ?? (await ensureClass(app, actor, input.campusId));
  const ctx = await orgContextFor(app, actor);
  const result = await app
    .get(AdmitWithAccountService, { strict: false })
    .admit(ctx, {
      firstName: input.firstName ?? `Student${sequence}`,
      lastName: input.lastName ?? 'Tester',
      gender: input.gender ?? 'F',
      dateOfBirth: input.dateOfBirth ?? '2014-03-03',
      classArmId,
      guardians: input.guardians ?? [
        {
          new: {
            fullName: `Guardian ${sequence}`,
            phone: '08012345678',
            address: '1 Test Street',
            relationship: 'mother',
            paysFees: true,
            login: { kind: 'username' },
          },
        },
      ],
    });
  return { ...result.student, logins: result.logins };
}

export const admissionBody = (classArmId: string, n: string) => ({
  firstName: `Student${n}`,
  lastName: 'Tester',
  gender: 'F',
  dateOfBirth: '2014-03-03',
  classArmId,
  guardians: [
    {
      new: {
        fullName: `Guardian ${n}`,
        phone: '08012345678',
        address: '1 Test Street',
        relationship: 'mother',
        login: { kind: 'username' },
      },
    },
  ],
});
