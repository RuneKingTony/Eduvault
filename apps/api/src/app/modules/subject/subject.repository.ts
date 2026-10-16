import type { LevelSubjectKind } from '@eduvault/api-contract';

export interface SubjectRecord {
  id: string;
  code: string;
  name: string;
  retiredAt: string | null;
  levelCodes: string[];
}

export interface SubjectPage {
  items: SubjectRecord[];
  total: number;
}

export interface SubjectPaging {
  includeRetired: boolean;
  limit: number;
  offset: number;
}

export interface NewSubject {
  code: string;
  name: string;
}

export interface LevelSubjectRecord {
  classLevelId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  subjectRetiredAt: string | null;
  kind: LevelSubjectKind;
  sequence: number;
}

export interface TermRecord {
  id: string;
  name: string;
}

export interface ArmSubjectRecord {
  classId: string;
  subjectId: string;
  code: string;
  name: string;
  kind: LevelSubjectKind;
  sequence: number;
  teacher: { userId: string; name: string } | null;
}

export interface SubjectTeacherKey {
  classId: string;
  subjectId: string;
  termId: string;
}

export interface NewSubjectTeacher extends SubjectTeacherKey {
  userId: string;
  assignedBy: string;
}

export interface TermAssignment {
  classId: string;
  subjectId: string;
  userId: string;
}

export abstract class SubjectRepository {
  abstract listSubjects(
    organizationId: string,
    paging: SubjectPaging
  ): Promise<SubjectPage>;

  abstract findSubject(
    organizationId: string,
    id: string
  ): Promise<SubjectRecord | undefined>;

  abstract findSubjectByCode(
    organizationId: string,
    code: string
  ): Promise<SubjectRecord | undefined>;

  abstract insertSubject(
    organizationId: string,
    input: NewSubject
  ): Promise<string>;

  abstract renameSubject(
    organizationId: string,
    id: string,
    name: string
  ): Promise<void>;

  abstract setSubjectRetired(
    organizationId: string,
    id: string,
    retiredBy: string | null
  ): Promise<void>;

  abstract isOnAnyLevel(organizationId: string, id: string): Promise<boolean>;

  abstract levelExists(organizationId: string, id: string): Promise<boolean>;

  abstract listLevelSubjects(
    organizationId: string,
    classLevelId?: string
  ): Promise<LevelSubjectRecord[]>;

  abstract currentTerm(organizationId: string): Promise<TermRecord | undefined>;

  /** The term with the greatest `starts_on` below the current term's, across school years. */
  abstract previousTerm(
    organizationId: string
  ): Promise<TermRecord | undefined>;

  abstract listArmSubjects(
    organizationId: string,
    classIds: readonly string[],
    termId: string
  ): Promise<ArmSubjectRecord[]>;

  abstract listAssignments(
    organizationId: string,
    classIds: readonly string[],
    termId: string
  ): Promise<TermAssignment[]>;

  abstract upsertSubjectTeacher(
    organizationId: string,
    input: NewSubjectTeacher
  ): Promise<void>;

  /** Returns false when the slot is already filled, and changes nothing then. */
  abstract insertSubjectTeacherIfEmpty(
    organizationId: string,
    input: NewSubjectTeacher
  ): Promise<boolean>;

  abstract deleteSubjectTeacher(
    organizationId: string,
    key: SubjectTeacherKey
  ): Promise<boolean>;
}
