import type {
  ClassStatus,
  ClassTeacherRole,
  RosterRow,
} from '@eduvault/api-contract';
import type { PermissionMap } from '@eduvault/policy';
import type { CampusClassScope } from '../../common/scope';

export interface LevelRecord {
  id: string;
  code: string;
  name: string;
  sequence: number;
  nextLevelId: string | null;
}

export interface NewLevel {
  code: string;
  name: string;
  nextLevelId: string | null;
}

export interface ClassRecord {
  id: string;
  name: string;
  levelId: string;
  levelCode: string;
  levelName: string;
  levelNextLevelId: string | null;
  campusId: string;
  campusName: string;
  retiredAt: string | null;
}

export interface ClassFilter extends CampusClassScope {
  campusId?: string;
  levelId?: string;
  status: ClassStatus;
}

export interface NewClass {
  levelId: string;
  campusId: string;
  name: string;
}

export interface ClassTeacherRecord {
  classId: string;
  userId: string;
  name: string;
  role: ClassTeacherRole;
}

export interface NewClassTeacher {
  classId: string;
  sessionId: string;
  userId: string;
  role: ClassTeacherRole;
  createdBy: string;
}

export interface ClassTeacherKey {
  classId: string;
  sessionId: string;
  userId: string;
}

export interface SchoolMemberRecord {
  userId: string;
  name: string;
  roles: string[];
  onCampus: boolean;
}

export abstract class ClassRepository {
  abstract listLevels(organizationId: string): Promise<LevelRecord[]>;

  abstract findLevel(
    organizationId: string,
    id: string
  ): Promise<LevelRecord | undefined>;

  abstract findLevelByCode(
    organizationId: string,
    code: string
  ): Promise<LevelRecord | undefined>;

  abstract insertLevel(
    organizationId: string,
    input: NewLevel
  ): Promise<LevelRecord>;

  abstract updateLevel(
    organizationId: string,
    id: string,
    changes: { name?: string; nextLevelId?: string | null }
  ): Promise<void>;

  abstract applyLevelOrder(
    organizationId: string,
    orderedIds: readonly string[]
  ): Promise<void>;

  abstract listClasses(
    organizationId: string,
    filter: ClassFilter
  ): Promise<ClassRecord[]>;

  abstract findClass(
    organizationId: string,
    id: string,
    visibility: CampusClassScope
  ): Promise<ClassRecord | undefined>;

  abstract findClassByName(
    organizationId: string,
    input: NewClass
  ): Promise<ClassRecord | undefined>;

  abstract insertClass(
    organizationId: string,
    input: NewClass
  ): Promise<string>;

  abstract renameClass(
    organizationId: string,
    id: string,
    name: string
  ): Promise<void>;

  abstract setRetired(
    organizationId: string,
    id: string,
    retiredBy: string | null
  ): Promise<void>;

  abstract hasPlacementsFromCurrentTerm(
    organizationId: string,
    classId: string
  ): Promise<boolean>;

  abstract studentCounts(
    organizationId: string,
    classIds: readonly string[]
  ): Promise<Record<string, number>>;

  abstract roster(
    organizationId: string,
    classId: string
  ): Promise<RosterRow[]>;

  abstract currentSessionId(organizationId: string): Promise<string | null>;

  abstract teachersOf(
    organizationId: string,
    classIds: readonly string[],
    sessionId: string
  ): Promise<ClassTeacherRecord[]>;

  abstract listMembers(
    organizationId: string,
    campusId: string
  ): Promise<SchoolMemberRecord[]>;

  abstract rolePermissions(
    organizationId: string
  ): Promise<Record<string, PermissionMap>>;

  abstract insertTeacher(
    organizationId: string,
    input: NewClassTeacher
  ): Promise<void>;

  abstract deleteTeacher(
    organizationId: string,
    key: ClassTeacherKey
  ): Promise<boolean>;
}
