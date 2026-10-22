import type { RosterRow } from '@eduvault/api-contract';
import type { PermissionMap } from '@eduvault/policy';
import {
  ClassRepository,
  type ClassFilter,
  type ClassTeacherKey,
  type ClassRecord,
  type ClassTeacherRecord,
  type LevelRecord,
  type NewClass,
  type NewClassTeacher,
  type NewLevel,
  type SchoolMemberRecord,
} from './class.repository';
import type { CampusClassScope } from '../../common/scope';

interface FakeClass {
  id: string;
  name: string;
  levelId: string;
  campusId: string;
  retiredAt: string | null;
}

interface FakeTeacher extends ClassTeacherRecord {
  sessionId: string;
}

const visible = (record: ClassRecord, visibility: CampusClassScope): boolean =>
  (visibility.campusScope === 'all' ||
    visibility.campusScope.includes(record.campusId)) &&
  (visibility.classScope === 'all' ||
    visibility.classScope.includes(record.id));

export class FakeClassRepository extends ClassRepository {
  levels: LevelRecord[] = [];
  classes: FakeClass[] = [];
  teachers: FakeTeacher[] = [];
  members: SchoolMemberRecord[] = [];
  campusNames: Record<string, string> = {};
  custom: Record<string, PermissionMap> = {};
  placements = false;
  counts: Record<string, number> = {};
  rosters: Record<string, RosterRow[]> = {};
  sessionId: string | null = 'year-1';
  appliedOrders: string[][] = [];
  private counter = 0;

  nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  listLevels(): Promise<LevelRecord[]> {
    return Promise.resolve(
      this.levels.toSorted((a, b) => a.sequence - b.sequence)
    );
  }

  findLevel(_org: string, id: string): Promise<LevelRecord | undefined> {
    return Promise.resolve(this.levels.find((level) => level.id === id));
  }

  findLevelByCode(
    _org: string,
    code: string
  ): Promise<LevelRecord | undefined> {
    return Promise.resolve(this.levels.find((level) => level.code === code));
  }

  insertLevel(_org: string, input: NewLevel): Promise<LevelRecord> {
    const level: LevelRecord = {
      id: this.nextId('level'),
      sequence: Math.max(0, ...this.levels.map((l) => l.sequence)) + 1,
      ...input,
    };
    this.levels.push(level);
    return Promise.resolve(level);
  }

  updateLevel(
    _org: string,
    id: string,
    changes: { name?: string; nextLevelId?: string | null }
  ): Promise<void> {
    const level = this.levels.find((candidate) => candidate.id === id);
    if (level) {
      if (changes.name !== undefined) {
        level.name = changes.name;
      }
      if (changes.nextLevelId !== undefined) {
        level.nextLevelId = changes.nextLevelId;
      }
    }
    return Promise.resolve();
  }

  applyLevelOrder(_org: string, orderedIds: readonly string[]): Promise<void> {
    this.appliedOrders.push([...orderedIds]);
    for (const [index, id] of orderedIds.entries()) {
      const level = this.levels.find((candidate) => candidate.id === id);
      if (level) {
        level.sequence = index + 1;
      }
    }
    return Promise.resolve();
  }

  private record(arm: FakeClass): ClassRecord {
    const level = this.levels.find((candidate) => candidate.id === arm.levelId);
    return {
      id: arm.id,
      name: arm.name,
      levelId: arm.levelId,
      levelCode: level?.code ?? '',
      levelName: level?.name ?? '',
      levelNextLevelId: level?.nextLevelId ?? null,
      campusId: arm.campusId,
      campusName: this.campusNames[arm.campusId] ?? arm.campusId,
      retiredAt: arm.retiredAt,
    };
  }

  listClasses(_org: string, filter: ClassFilter): Promise<ClassRecord[]> {
    const records = this.classes
      .map((arm) => this.record(arm))
      .filter((record) => visible(record, filter))
      .filter(
        (record) =>
          filter.campusId === undefined || record.campusId === filter.campusId
      )
      .filter(
        (record) =>
          filter.levelId === undefined || record.levelId === filter.levelId
      )
      .filter(
        (record) =>
          filter.status === 'all' ||
          (filter.status === 'active') === (record.retiredAt === null)
      );
    return Promise.resolve(records);
  }

  findClass(
    _org: string,
    id: string,
    visibility: CampusClassScope
  ): Promise<ClassRecord | undefined> {
    const arm = this.classes.find((candidate) => candidate.id === id);
    const record = arm && this.record(arm);
    return Promise.resolve(
      record && visible(record, visibility) ? record : undefined
    );
  }

  findClassByName(
    _org: string,
    input: NewClass
  ): Promise<ClassRecord | undefined> {
    const arm = this.classes.find(
      (candidate) =>
        candidate.levelId === input.levelId &&
        candidate.campusId === input.campusId &&
        candidate.name === input.name
    );
    return Promise.resolve(arm && this.record(arm));
  }

  insertClass(_org: string, input: NewClass): Promise<string> {
    const arm: FakeClass = {
      id: this.nextId('class'),
      name: input.name,
      levelId: input.levelId,
      campusId: input.campusId,
      retiredAt: null,
    };
    this.classes.push(arm);
    return Promise.resolve(arm.id);
  }

  renameClass(_org: string, id: string, name: string): Promise<void> {
    const arm = this.classes.find((candidate) => candidate.id === id);
    if (arm) {
      arm.name = name;
    }
    return Promise.resolve();
  }

  setRetired(
    _org: string,
    id: string,
    retiredBy: string | null
  ): Promise<void> {
    const arm = this.classes.find((candidate) => candidate.id === id);
    if (arm) {
      arm.retiredAt = retiredBy === null ? null : '2026-10-10T00:00:00.000Z';
    }
    return Promise.resolve();
  }

  hasPlacementsFromCurrentTerm(): Promise<boolean> {
    return Promise.resolve(this.placements);
  }

  studentCounts(
    _org: string,
    classIds: readonly string[]
  ): Promise<Record<string, number>> {
    return Promise.resolve(
      Object.fromEntries(classIds.map((id) => [id, this.counts[id] ?? 0]))
    );
  }

  roster(_org: string, classId: string): Promise<RosterRow[]> {
    return Promise.resolve(this.rosters[classId] ?? []);
  }

  currentSessionId(): Promise<string | null> {
    return Promise.resolve(this.sessionId);
  }

  teachersOf(
    _org: string,
    classIds: readonly string[],
    sessionId: string
  ): Promise<ClassTeacherRecord[]> {
    return Promise.resolve(
      this.teachers.filter(
        (teacher) =>
          classIds.includes(teacher.classId) && teacher.sessionId === sessionId
      )
    );
  }

  listMembers(): Promise<SchoolMemberRecord[]> {
    return Promise.resolve(this.members);
  }

  rolePermissions(): Promise<Record<string, PermissionMap>> {
    return Promise.resolve(this.custom);
  }

  insertTeacher(_org: string, input: NewClassTeacher): Promise<void> {
    const member = this.members.find(
      (candidate) => candidate.userId === input.userId
    );
    this.teachers.push({
      classId: input.classId,
      sessionId: input.sessionId,
      userId: input.userId,
      name: member?.name ?? input.userId,
      role: input.role,
    });
    return Promise.resolve();
  }

  deleteTeacher(_org: string, key: ClassTeacherKey): Promise<boolean> {
    const index = this.teachers.findIndex(
      (teacher) =>
        teacher.classId === key.classId &&
        teacher.sessionId === key.sessionId &&
        teacher.userId === key.userId
    );
    if (index !== -1) {
      this.teachers.splice(index, 1);
    }
    return Promise.resolve(index !== -1);
  }
}
