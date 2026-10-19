import type { NewGuardian, GuardianRelationship } from '@eduvault/api-contract';
import type { CampusScope } from '../../common/campus-scope';
import type { SchoolRules } from '../../common/people';
import type { CampusClassScope } from '../../common/scope';

export interface CurrentTerm {
  termId: string;
  termName: string;
  sessionId: string;
  sessionName: string;
}

export interface AdmissionClass {
  id: string;
  levelId: string;
  levelName: string;
  name: string;
  campusId: string;
  campusName: string;
}

export interface SchoolNaming {
  prefix: string;
  slug: string;
}

export interface DuplicateMatch {
  studentId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  notSeenSince: string | null;
  exitKind: 'left' | 'graduated' | null;
  inScope: boolean;
}

export type AdmissionGuardian =
  | {
      kind: 'existing';
      guardianId: string;
      relationship: GuardianRelationship;
      paysFees: boolean;
    }
  | { kind: 'new'; guardian: NewGuardian; passwordHash: string };

export interface AdmissionWrite {
  organizationId: string;
  actor: { id: string; name: string };
  student: {
    firstName: string;
    lastName: string;
    gender: 'F' | 'M';
    dateOfBirth: string;
  };
  arm: AdmissionClass;
  term: CurrentTerm;
  startsLater: boolean;
  school: SchoolNaming;
  studentPasswordHash: string;
  guardians: readonly AdmissionGuardian[];
}

export interface AdmittedGuardian {
  guardianId: string;
  name: string;
  relationship: GuardianRelationship;
  isNew: boolean;
  newLogin: boolean;
  email: string | null;
  username: string | null;
}

export interface AdmissionOutcome {
  studentId: string;
  admissionNumber: string;
  studentUsername: string;
  guardians: AdmittedGuardian[];
}

export abstract class AdmissionRepository {
  abstract today(organizationId: string): string;

  abstract currentTerm(
    organizationId: string
  ): Promise<CurrentTerm | undefined>;

  abstract nextTerm(
    organizationId: string,
    termId: string
  ): Promise<{ id: string; name: string } | undefined>;

  abstract rules(organizationId: string): Promise<SchoolRules>;

  abstract school(organizationId: string): Promise<SchoolNaming>;

  abstract nextNumber(organizationId: string): Promise<number>;

  abstract classes(
    organizationId: string,
    campusScope: CampusScope
  ): Promise<AdmissionClass[]>;

  abstract findClass(
    organizationId: string,
    input: { campusScope: CampusScope; classArmId: string }
  ): Promise<AdmissionClass | undefined>;

  abstract guardiansInSchool(
    organizationId: string,
    ids: readonly string[]
  ): Promise<string[]>;

  abstract duplicates(
    organizationId: string,
    scope: CampusClassScope,
    input: {
      firstName: string;
      lastName: string;
      dateOfBirth: string;
    }
  ): Promise<DuplicateMatch[]>;

  abstract admit(write: AdmissionWrite): Promise<AdmissionOutcome>;
}
