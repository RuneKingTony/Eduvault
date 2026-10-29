import type { GuardianDraft } from '@eduvault/api-contract';
import { AdmissionService } from '../../../src/app/modules/student/admission.service';
import { openPortalLogins } from '../student-seed';
import {
  mustFind,
  progressLogger,
  type AcademicFacts,
  type DemoRun,
  type PeopleFacts,
  type SchoolFacts,
} from './demo-run';
import type {
  DemoFamily,
  DemoGuardian,
  FamilyNumber,
  StudentNumber,
} from './people-plan';
import { databaseOf } from '../database';

const PROGRESS_EVERY = 100;

const newGuardian = (guardian: DemoGuardian): GuardianDraft => ({
  new: {
    fullName: guardian.fullName,
    phone: guardian.phone,
    address: guardian.address,
    relationship: guardian.relationship,
    paysFees: guardian.paysFees,
    login:
      guardian.email === null
        ? { kind: 'username' }
        : { kind: 'email', email: guardian.email },
  },
});

interface WritablePeopleFacts {
  studentIds: Map<StudentNumber, string>;
  payerIds: Map<FamilyNumber, string>;
}

async function admitFamily(
  run: DemoRun,
  family: DemoFamily,
  context: {
    school: SchoolFacts;
    academics: AcademicFacts;
    people: WritablePeopleFacts;
  }
): Promise<void> {
  const admissions = run.app.get(AdmissionService, { strict: false });
  const known = new Map<string, string>();
  for (const child of family.children) {
    const result = await admissions.admit(context.school.owner, {
      firstName: child.firstName,
      lastName: child.lastName,
      gender: child.gender,
      dateOfBirth: child.dateOfBirth,
      classArmId: mustFind(
        context.academics.armIds[child.arm],
        `class ${child.arm}`
      ),
      guardians: family.guardians.map((guardian): GuardianDraft =>
        known.has(guardian.fullName)
          ? {
              existingGuardianId: mustFind(
                known.get(guardian.fullName),
                guardian.fullName
              ),
              relationship: guardian.relationship,
              paysFees: guardian.paysFees,
            }
          : newGuardian(guardian)
      ),
    });
    context.people.studentIds.set(child.number, result.student.id);
    for (const link of result.student.guardians ?? []) {
      known.set(link.fullName, link.guardianId);
      const payer = family.guardians.find(
        (guardian) => guardian.fullName === link.fullName
      );
      if (payer?.paysFees === true) {
        context.people.payerIds.set(family.number, link.guardianId);
      }
    }
  }
}

/** One at a time in plan order, so each student gets the admission number of their place in the plan. */
export async function admitStudents(
  run: DemoRun,
  school: SchoolFacts,
  academics: AcademicFacts
): Promise<PeopleFacts> {
  const people: WritablePeopleFacts = {
    studentIds: new Map(),
    payerIds: new Map(),
  };
  const logProgress = progressLogger(run, run.plan.size.students, {
    every: PROGRESS_EVERY,
    line: (done) => `  admitted ${done} of ${run.plan.size.students} students`,
  });
  for (const family of run.plan.families) {
    await admitFamily(run, family, { school, academics, people });
    logProgress(family.children.length);
  }
  await openPortalLogins(run.app, databaseOf(run.app), school.organizationId);
  return people;
}
