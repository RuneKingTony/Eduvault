import {
  SubjectRepository,
  type ArmSubjectRecord,
  type LevelSubjectRecord,
  type NewSubject,
  type NewSubjectTeacher,
  type SubjectPage,
  type SubjectPaging,
  type SubjectRecord,
  type SubjectTeacherKey,
  type TermAssignment,
  type TermRecord,
} from './subject.repository';

interface FakeSubject {
  id: string;
  code: string;
  name: string;
  retiredAt: string | null;
}

interface FakeLevelSubject {
  classLevelId: string;
  subjectId: string;
  kind: 'core' | 'elective';
  sequence: number;
}

interface FakeAssignment extends SubjectTeacherKey {
  userId: string;
  assignedBy: string;
}

interface FakeArm {
  id: string;
  levelId: string;
}

export class FakeSubjectRepository extends SubjectRepository {
  subjects: FakeSubject[] = [];
  levelSubjects: FakeLevelSubject[] = [];
  levelCodes: Record<string, string> = {};
  levelSequence: Record<string, number> = {};
  terms: (TermRecord & { startsOn: string; current: boolean })[] = [];
  arms: FakeArm[] = [];
  userNames: Record<string, string> = {};
  assignments: FakeAssignment[] = [];
  private counter = 0;

  private codesOf(subjectId: string): string[] {
    return this.levelSubjects
      .filter((entry) => entry.subjectId === subjectId)
      .map((entry) => entry.classLevelId)
      .toSorted(
        (a, b) => (this.levelSequence[a] ?? 0) - (this.levelSequence[b] ?? 0)
      )
      .map((levelId) => this.levelCodes[levelId] ?? levelId);
  }

  private record(subject: FakeSubject): SubjectRecord {
    return {
      id: subject.id,
      code: subject.code,
      name: subject.name,
      retiredAt: subject.retiredAt,
      levelCodes: this.codesOf(subject.id),
    };
  }

  listSubjects(_org: string, paging: SubjectPaging): Promise<SubjectPage> {
    const all = this.subjects
      .filter((subject) => paging.includeRetired || subject.retiredAt === null)
      .toSorted(
        (a, b) =>
          Number(a.retiredAt !== null) - Number(b.retiredAt !== null) ||
          a.name.localeCompare(b.name) ||
          a.id.localeCompare(b.id)
      );
    return Promise.resolve({
      items: all
        .slice(paging.offset, paging.offset + paging.limit)
        .map((subject) => this.record(subject)),
      total: all.length,
    });
  }

  findSubject(_org: string, id: string): Promise<SubjectRecord | undefined> {
    const found = this.subjects.find((subject) => subject.id === id);
    return Promise.resolve(found && this.record(found));
  }

  findSubjectByCode(
    _org: string,
    code: string
  ): Promise<SubjectRecord | undefined> {
    const found = this.subjects.find((subject) => subject.code === code);
    return Promise.resolve(found && this.record(found));
  }

  insertSubject(_org: string, input: NewSubject): Promise<string> {
    this.counter += 1;
    const id = `subject-${this.counter}`;
    this.subjects.push({ id, ...input, retiredAt: null });
    return Promise.resolve(id);
  }

  renameSubject(_org: string, id: string, name: string): Promise<void> {
    const found = this.subjects.find((subject) => subject.id === id);
    if (found) {
      found.name = name;
    }
    return Promise.resolve();
  }

  setSubjectRetired(
    _org: string,
    id: string,
    retiredBy: string | null
  ): Promise<void> {
    const found = this.subjects.find((subject) => subject.id === id);
    if (found) {
      found.retiredAt = retiredBy === null ? null : '2026-10-15T00:00:00.000Z';
    }
    return Promise.resolve();
  }

  isOnAnyLevel(_org: string, id: string): Promise<boolean> {
    return Promise.resolve(
      this.levelSubjects.some((entry) => entry.subjectId === id)
    );
  }

  levelExists(_org: string, id: string): Promise<boolean> {
    return Promise.resolve(id in this.levelCodes);
  }

  listLevelSubjects(
    _org: string,
    classLevelId?: string
  ): Promise<LevelSubjectRecord[]> {
    return Promise.resolve(
      this.levelSubjects
        .filter(
          (entry) =>
            classLevelId === undefined || entry.classLevelId === classLevelId
        )
        .toSorted(
          (a, b) =>
            (this.levelSequence[a.classLevelId] ?? 0) -
              (this.levelSequence[b.classLevelId] ?? 0) ||
            a.sequence - b.sequence
        )
        .flatMap((entry) => {
          const subject = this.subjects.find(
            (candidate) => candidate.id === entry.subjectId
          );
          return subject
            ? [
                {
                  classLevelId: entry.classLevelId,
                  subjectId: entry.subjectId,
                  subjectCode: subject.code,
                  subjectName: subject.name,
                  subjectRetiredAt: subject.retiredAt,
                  kind: entry.kind,
                  sequence: entry.sequence,
                },
              ]
            : [];
        })
    );
  }

  currentTerm(): Promise<TermRecord | undefined> {
    const current = this.terms.find((term) => term.current);
    return Promise.resolve(current && { id: current.id, name: current.name });
  }

  previousTerm(): Promise<TermRecord | undefined> {
    const current = this.terms.find((term) => term.current);
    const earlier = this.terms
      .filter(
        (term) => current !== undefined && term.startsOn < current.startsOn
      )
      .toSorted((a, b) => b.startsOn.localeCompare(a.startsOn))[0];
    return Promise.resolve(earlier && { id: earlier.id, name: earlier.name });
  }

  listArmSubjects(
    _org: string,
    classIds: readonly string[],
    termId: string
  ): Promise<ArmSubjectRecord[]> {
    return Promise.resolve(
      this.arms
        .filter((arm) => classIds.includes(arm.id))
        .flatMap((arm) =>
          this.levelSubjects
            .filter((entry) => entry.classLevelId === arm.levelId)
            .flatMap((entry) => {
              const subject = this.subjects.find(
                (candidate) => candidate.id === entry.subjectId
              );
              const row = this.assignments.find(
                (assignment) =>
                  assignment.classId === arm.id &&
                  assignment.subjectId === entry.subjectId &&
                  assignment.termId === termId
              );
              return subject
                ? [
                    {
                      classId: arm.id,
                      subjectId: subject.id,
                      code: subject.code,
                      name: subject.name,
                      kind: entry.kind,
                      sequence: entry.sequence,
                      teacher: row
                        ? {
                            userId: row.userId,
                            name: this.userNames[row.userId] ?? row.userId,
                          }
                        : null,
                    },
                  ]
                : [];
            })
        )
    );
  }

  listAssignments(
    _org: string,
    classIds: readonly string[],
    termId: string
  ): Promise<TermAssignment[]> {
    return Promise.resolve(
      this.assignments
        .filter(
          (row) => row.termId === termId && classIds.includes(row.classId)
        )
        .map(({ classId, subjectId, userId }) => ({
          classId,
          subjectId,
          userId,
        }))
    );
  }

  upsertSubjectTeacher(_org: string, input: NewSubjectTeacher): Promise<void> {
    this.assignments = this.assignments.filter(
      (row) =>
        !(
          row.classId === input.classId &&
          row.subjectId === input.subjectId &&
          row.termId === input.termId
        )
    );
    this.assignments.push({ ...input });
    return Promise.resolve();
  }

  async insertSubjectTeacherIfEmpty(
    org: string,
    input: NewSubjectTeacher
  ): Promise<boolean> {
    const taken = this.assignments.some(
      (row) =>
        row.classId === input.classId &&
        row.subjectId === input.subjectId &&
        row.termId === input.termId
    );
    if (!taken) {
      await this.upsertSubjectTeacher(org, input);
    }
    return !taken;
  }

  deleteSubjectTeacher(_org: string, key: SubjectTeacherKey): Promise<boolean> {
    const before = this.assignments.length;
    this.assignments = this.assignments.filter(
      (row) =>
        !(
          row.classId === key.classId &&
          row.subjectId === key.subjectId &&
          row.termId === key.termId
        )
    );
    return Promise.resolve(this.assignments.length < before);
  }
}
