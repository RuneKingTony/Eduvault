import type { LeavingReason } from '@eduvault/api-contract';
import type { ActivityInput } from '../../common/activity';
import type { GraduatingStudent } from '../../common/students';
import type { CurrentTerm } from './admission.repository';

export interface LifecycleStudent {
  id: string;
  firstName: string;
  lastName: string;
  admittedOn: string;
  userId: string | null;
  campusId: string;
  notSeenSince: string | null;
  exitKind: 'left' | 'graduated' | null;
  archivedTermId: string | null;
}

export interface EnrolmentFacts {
  id: string;
  levelId: string;
  levelName: string;
}

export interface PlacementArm {
  id: string;
  levelId: string;
  display: string;
  campusId: string;
  campusName: string;
  retired: boolean;
}

export interface LeavingWrite {
  organizationId: string;
  studentId: string;
  userId: string | null;
  actorUserId: string;
  reason: LeavingReason;
  lastDay: string;
  note: string | null;
  sessionId: string;
  termId: string;
}

export interface LifecycleTx {
  lockStudent(
    organizationId: string,
    studentId: string
  ): Promise<LifecycleStudent | undefined>;

  currentTerm(organizationId: string): Promise<CurrentTerm | undefined>;

  nextTerm(
    organizationId: string,
    termId: string
  ): Promise<{ id: string; name: string } | undefined>;

  setNotSeen(input: {
    organizationId: string;
    studentId: string;
    date: string;
    byUserId: string;
    note: string | null;
  }): Promise<void>;

  clearNotSeen(organizationId: string, studentId: string): Promise<void>;

  recordLeaving(write: LeavingWrite): Promise<void>;

  undoArchive(input: {
    organizationId: string;
    studentId: string;
    userId: string | null;
  }): Promise<void>;

  activeEnrolment(
    organizationId: string,
    input: { studentId: string; sessionId: string }
  ): Promise<EnrolmentFacts | undefined>;

  hasPlacement(
    organizationId: string,
    input: { enrolmentId: string; termId: string }
  ): Promise<boolean>;

  findArm(
    organizationId: string,
    armId: string
  ): Promise<PlacementArm | undefined>;

  openArmsAtLevel(
    organizationId: string,
    levelId: string
  ): Promise<PlacementArm[]>;

  insertPlacement(input: {
    organizationId: string;
    enrolmentId: string;
    termId: string;
    arm: PlacementArm;
    actorUserId: string;
  }): Promise<void>;

  lockRoster(
    organizationId: string,
    input: { armId: string; ids: readonly string[] }
  ): Promise<GraduatingStudent[]>;

  graduate(input: {
    organizationId: string;
    actorUserId: string;
    termId: string;
    sessionId: string;
    students: readonly GraduatingStudent[];
  }): Promise<number>;

  resetLogin(input: {
    organizationId: string;
    userId: string;
    passwordHash: string;
  }): Promise<'reset' | 'shared' | 'missing'>;

  record(input: ActivityInput): Promise<void>;
}

export abstract class LifecycleRepository {
  abstract transaction<T>(fn: (tx: LifecycleTx) => Promise<T>): Promise<T>;
}
