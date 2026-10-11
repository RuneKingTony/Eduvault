import type { GuardianRelationship } from '@eduvault/api-contract';
import type { ActivityInput } from '../activity';
import type { NewPortalLogin } from '../auth/portal-login';

export interface GuardianRecord {
  id: string;
  fullName: string;
  userId: string;
  email: string | null;
}

export interface SchoolRules {
  maxGuardians: number;
  requireGuardian: boolean;
}

export interface LinkRecord {
  guardianId: string;
  paysFees: boolean;
}

export interface StudentFacts {
  id: string;
  firstName: string;
  lastName: string;
  onRoll: boolean;
  campusId: string;
}

export interface LoginHolds {
  platformRole: string | null;
  memberships: { organizationId: string; roles: string[] }[];
}

export interface NewGuardianRow {
  organizationId: string;
  fullName: string;
  phone: string;
  email: string | null;
  address: string;
  photoFileId: string | null;
  userId: string;
  createdBy: string;
}

export interface NewLinkRow {
  organizationId: string;
  guardianId: string;
  studentId: string;
  relationship: GuardianRelationship;
  paysFees: boolean;
  createdBy: string;
}

export interface LinkKey {
  organizationId: string;
  studentId: string;
  guardianId: string;
}

export interface LinkPatch {
  relationship?: GuardianRelationship;
  paysFees?: boolean;
}

export interface GuardianTx {
  lockStudent(
    organizationId: string,
    studentId: string
  ): Promise<StudentFacts | undefined>;
  rules(organizationId: string): Promise<SchoolRules>;
  linksOf(organizationId: string, studentId: string): Promise<LinkRecord[]>;
  findGuardian(
    organizationId: string,
    guardianId: string
  ): Promise<GuardianRecord | undefined>;
  findGuardianByEmail(
    organizationId: string,
    email: string
  ): Promise<GuardianRecord | undefined>;
  findUserByEmail(email: string): Promise<{ id: string } | undefined>;
  lockLogin(userId: string): Promise<LoginHolds | undefined>;
  resetPassword(userId: string, passwordHash: string): Promise<void>;
  takenUsernames(base: string): Promise<ReadonlySet<string>>;
  createLogin(input: NewPortalLogin): Promise<string>;
  addRole(organizationId: string, userId: string, role: string): Promise<void>;
  stripRole(
    organizationId: string,
    userId: string,
    role: string
  ): Promise<string[]>;
  insertGuardian(row: NewGuardianRow): Promise<string>;
  insertLink(row: NewLinkRow): Promise<void>;
  updateLink(key: LinkKey, patch: LinkPatch): Promise<void>;
  deleteLink(key: LinkKey): Promise<void>;
  countLinksOfGuardian(
    organizationId: string,
    guardianId: string
  ): Promise<number>;
  photoIsFree(organizationId: string, fileId: string): Promise<boolean>;
  recordActivity(input: ActivityInput): Promise<void>;
}
