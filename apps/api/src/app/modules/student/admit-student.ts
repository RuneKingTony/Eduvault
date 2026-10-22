import { NotFoundException } from '@nestjs/common';
import { GUARDIAN_NOT_FOUND_MESSAGE } from '@eduvault/api-contract';
import { attachGuardian, provisionGuardian } from '../../common/people';
import { formatAdmissionNumber, formatStudentUsername } from './admission-ids';
import type { AdmissionTx } from './admission-tx';
import {
  UsernameTakenError,
  type AdmissionGuardian,
  type AdmissionOutcome,
  type AdmissionRepository,
  type AdmissionWrite,
  type AdmittedGuardian,
} from './admission.repository';

interface GuardianStep {
  write: AdmissionWrite;
  studentId: string;
  draft: AdmissionGuardian;
}

type ExistingDraft = Extract<AdmissionGuardian, { kind: 'existing' }>;
type NewDraft = Extract<AdmissionGuardian, { kind: 'new' }>;

const attachBase = ({ write, studentId }: GuardianStep) => ({
  organizationId: write.organizationId,
  studentId,
  actorId: write.actor.id,
});

async function admitExisting(
  tx: AdmissionTx,
  step: GuardianStep & { draft: ExistingDraft }
): Promise<AdmittedGuardian> {
  const { draft } = step;
  const guardian = await tx.findGuardian(
    step.write.organizationId,
    draft.guardianId
  );
  if (guardian === undefined) {
    throw new NotFoundException(GUARDIAN_NOT_FOUND_MESSAGE);
  }
  await attachGuardian(tx, {
    ...attachBase(step),
    guardianId: guardian.id,
    userId: guardian.userId,
    relationship: draft.relationship,
    paysFees: draft.paysFees,
  });
  return {
    guardianId: guardian.id,
    name: guardian.fullName,
    relationship: draft.relationship,
    isNew: false,
    newLogin: false,
    email: null,
    username: null,
  };
}

async function admitNew(
  tx: AdmissionTx,
  step: GuardianStep & { draft: NewDraft }
): Promise<AdmittedGuardian> {
  const { write, draft } = step;
  const provisioned = await provisionGuardian(tx, {
    organizationId: write.organizationId,
    actorId: write.actor.id,
    guardian: draft.guardian,
    passwordHash: draft.passwordHash,
  });
  await attachGuardian(tx, {
    ...attachBase(step),
    guardianId: provisioned.guardianId,
    userId: provisioned.userId,
    relationship: draft.guardian.relationship,
    paysFees: draft.guardian.paysFees,
  });
  return {
    guardianId: provisioned.guardianId,
    name: draft.guardian.fullName,
    relationship: draft.guardian.relationship,
    isNew: true,
    newLogin: provisioned.newLogin,
    email: provisioned.email,
    username: provisioned.username,
  };
}

const admitGuardian = (
  tx: AdmissionTx,
  step: GuardianStep
): Promise<AdmittedGuardian> =>
  step.draft.kind === 'existing'
    ? admitExisting(tx, { ...step, draft: step.draft })
    : admitNew(tx, { ...step, draft: step.draft });

export const activityText = (
  write: AdmissionWrite,
  admissionNumber: string,
  guardians: readonly AdmittedGuardian[]
): string => {
  const { firstName, lastName } = write.student;
  const from = write.startsLater ? ` from ${write.term.termName}` : '';
  const placed = `placed in ${write.arm.levelName} ${write.arm.name}${from}`;
  const names = guardians.map((guardian) => guardian.name).join(' and ');
  const noun = guardians.length === 1 ? 'guardian' : 'guardians';
  const people =
    guardians.length === 0
      ? 'with no guardian yet'
      : `with ${names} as ${noun}`;
  return `${firstName} ${lastName} admitted (${admissionNumber}), ${placed}, ${people}.`;
};

/** The order matters: the number comes first, the login before the guardians. */
async function admitInTransaction(
  tx: AdmissionTx,
  input: { write: AdmissionWrite; today: string }
): Promise<AdmissionOutcome> {
  const { write, today } = input;
  const number = await tx.allocateNumber(write.organizationId);
  const admissionNumber = formatAdmissionNumber(write.school.prefix, number);
  const studentUsername = formatStudentUsername(write.school.slug, number);
  const studentId = await tx.insertStudent({
    organizationId: write.organizationId,
    campusId: write.arm.campusId,
    firstName: write.student.firstName,
    lastName: write.student.lastName,
    gender: write.student.gender,
    dateOfBirth: write.student.dateOfBirth,
    admissionNumber,
    admittedOn: today,
    createdBy: write.actor.id,
  });
  await tx.insertEnrolment({
    organizationId: write.organizationId,
    studentId,
    sessionId: write.term.sessionId,
    levelId: write.arm.levelId,
    termId: write.term.termId,
    classArmId: write.arm.id,
    campusId: write.arm.campusId,
    createdBy: write.actor.id,
  });
  const userId = await tx.createLogin({
    organizationId: write.organizationId,
    role: 'student',
    name: `${write.student.firstName} ${write.student.lastName}`,
    email: null,
    username: studentUsername,
    passwordHash: write.studentPasswordHash,
  });
  await tx.linkLogin({
    organizationId: write.organizationId,
    studentId,
    userId,
  });
  const guardians: AdmittedGuardian[] = [];
  for (const draft of write.guardians) {
    guardians.push(await admitGuardian(tx, { write, studentId, draft }));
  }
  await tx.recordActivity({
    organizationId: write.organizationId,
    campusId: write.arm.campusId,
    pillar: 'foundation',
    kind: 'student.admitted',
    actorUserId: write.actor.id,
    subjectType: 'student',
    subjectId: studentId,
    text: activityText(write, admissionNumber, guardians),
    data: { admissionNumber, classArmId: write.arm.id },
  });
  return { studentId, admissionNumber, studentUsername, guardians };
}

/**
 * Admits one student in one transaction. A username can be taken by a login
 * created elsewhere between the lookup and the insert, so the whole
 * transaction is retried once; a second clash is the caller's answer.
 */
export async function admitStudent(
  admissions: Pick<AdmissionRepository, 'today' | 'transaction'>,
  write: AdmissionWrite
): Promise<AdmissionOutcome> {
  const attempt = () =>
    admissions.transaction((tx) =>
      admitInTransaction(tx, {
        write,
        today: admissions.today(write.organizationId),
      })
    );
  try {
    return await attempt();
  } catch (error) {
    if (!(error instanceof UsernameTakenError)) {
      throw error;
    }
  }
  return attempt();
}
