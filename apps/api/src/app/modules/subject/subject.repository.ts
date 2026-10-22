import type { LevelSubjectKind } from '@eduvault/api-contract';
import type { CampusClassScope } from '../../common/scope';

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
  takerCount: number;
}

export interface LevelListRow {
  subjectId: string;
  kind: LevelSubjectKind;
}

export interface TakerCount {
  classLevelId: string;
  subjectId: string;
  count: number;
}

export interface SessionRecord {
  id: string;
  name: string;
}

export interface ElectiveLevelRecord {
  subjectId: string;
  subjectName: string;
  classLevelId: string;
}

export interface ElectiveStudentQuery {
  sessionId: string;
  studentIds?: readonly string[];
}

export interface ElectiveStudentRecord {
  studentId: string;
  name: string;
  admissionNumber: string;
  classId: string | null;
  className: string | null;
  enrollmentId: string | null;
  classLevelId: string | null;
}

export interface ElectiveTakerRow {
  enrollmentId: string;
  subjectId: string;
}

export interface ElectiveWrite {
  subjectId: string;
  enrollmentIds: readonly string[];
  visibleEnrollmentIds: readonly string[];
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

  abstract subjectsByIds(
    organizationId: string,
    ids: readonly string[]
  ): Promise<SubjectRecord[]>;

  abstract currentSessionId(
    organizationId: string
  ): Promise<string | undefined>;

  /** Replaces the level's list in one transaction, first clearing this school year's takers of every elective that is removed or becomes core. */
  abstract replaceLevelList(
    organizationId: string,
    classLevelId: string,
    rows: readonly LevelListRow[]
  ): Promise<void>;

  abstract takerCounts(
    organizationId: string,
    classLevelId?: string
  ): Promise<TakerCount[]>;

  abstract findSession(
    organizationId: string,
    id: string
  ): Promise<SessionRecord | undefined>;

  /** Without `studentIds`: visible students with an active enrolment that session at a level that has an elective. With them: those ids that are visible, enrolment fields null when they have none. */
  abstract visibleElectiveStudents(
    organizationId: string,
    scope: CampusClassScope,
    query: ElectiveStudentQuery
  ): Promise<ElectiveStudentRecord[]>;

  abstract electiveTakers(
    organizationId: string,
    sessionId: string,
    enrollmentIds: readonly string[]
  ): Promise<ElectiveTakerRow[]>;

  abstract electiveLevels(
    organizationId: string
  ): Promise<ElectiveLevelRecord[]>;

  abstract setElectiveTakers(
    organizationId: string,
    write: ElectiveWrite
  ): Promise<void>;

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
