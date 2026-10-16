import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CLASS_MEMBER_NOT_FOUND_MESSAGE,
  SUBJECT_NOT_FOUND_MESSAGE,
  SUBJECT_NOT_ON_LEVEL_MESSAGE,
  SUBJECT_NO_CURRENT_TERM_MESSAGE,
  SUBJECT_NO_PREVIOUS_TERM_MESSAGE,
  SUBJECT_TEACHER_NOT_FOUND_MESSAGE,
  subjectClassArchivedMessage,
  subjectRetiredMessage,
  subjectTeacherNotCandidateMessage,
  type AssignSubjectTeacherInput,
  type AssignedSubjectTeacher,
  type SubjectTeacherRemoved,
  type SubjectTeachers,
  type SubjectTeachersCopied,
} from '@eduvault/api-contract';
import { can } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import { SchoolLock } from '../../common/db/school-lock';
import { ClassService, type ClassRef } from '../class/class.service';
import {
  SubjectRepository,
  type TermAssignment,
  type TermRecord,
} from './subject.repository';
import { assignmentKey, planCopy, toArm } from './subject-view';

@Injectable()
export class SubjectTeacherService {
  constructor(
    private readonly subjects: SubjectRepository,
    private readonly classes: ClassService,
    private readonly lock: SchoolLock
  ) {}

  private async requireCurrentTerm(ctx: OrgContext): Promise<TermRecord> {
    const term = await this.subjects.currentTerm(ctx.organizationId);
    if (term === undefined) {
      throw new ConflictException(SUBJECT_NO_CURRENT_TERM_MESSAGE);
    }
    return term;
  }

  private visibleClasses(ctx: OrgContext): Promise<ClassRef[]> {
    return can(ctx.permissions, 'class', 'read')
      ? this.classes.listVisible(ctx)
      : Promise.resolve([]);
  }

  async list(ctx: OrgContext): Promise<SubjectTeachers> {
    const term = await this.subjects.currentTerm(ctx.organizationId);
    if (term === undefined) {
      return { term: null, arms: [], copyFrom: null };
    }
    const classes = await this.visibleClasses(ctx);
    const ids = classes.map((record) => record.id);
    const [rows, copyFrom] = await Promise.all([
      this.subjects.listArmSubjects(ctx.organizationId, ids, term.id),
      this.copySource(ctx, ids),
    ]);
    return {
      term,
      arms: classes.map((record) => toArm(record, rows)),
      copyFrom,
    };
  }

  private async copySource(
    ctx: OrgContext,
    classIds: readonly string[]
  ): Promise<TermRecord | null> {
    if (!can(ctx.permissions, 'class', 'assignTeacher')) {
      return null;
    }
    const previous = await this.subjects.previousTerm(ctx.organizationId);
    if (previous === undefined) {
      return null;
    }
    const rows = await this.subjects.listAssignments(
      ctx.organizationId,
      classIds,
      previous.id
    );
    return rows.length > 0 ? previous : null;
  }

  assign(
    ctx: OrgContext,
    target: { classId: string; subjectId: string },
    input: AssignSubjectTeacherInput
  ): Promise<AssignedSubjectTeacher> {
    const organizationId = ctx.organizationId;
    const { classId, subjectId } = target;
    return this.lock.run(organizationId, async () => {
      const record = await this.classes.requireVisible(ctx, classId);
      const term = await this.requireCurrentTerm(ctx);
      const teacher = await this.checkAssignable(ctx, record, {
        subjectId,
        userId: input.userId,
      });
      await this.subjects.upsertSubjectTeacher(organizationId, {
        classId,
        subjectId,
        termId: term.id,
        userId: input.userId,
        assignedBy: ctx.user.id,
      });
      return {
        classId,
        subjectId,
        termId: term.id,
        userId: input.userId,
        name: teacher.name,
      };
    });
  }

  private async checkAssignable(
    ctx: OrgContext,
    record: ClassRef,
    pick: { subjectId: string; userId: string }
  ): Promise<{ name: string }> {
    const subject = await this.subjects.findSubject(
      ctx.organizationId,
      pick.subjectId
    );
    if (subject === undefined) {
      throw new NotFoundException(SUBJECT_NOT_FOUND_MESSAGE);
    }
    if (record.retiredAt !== null) {
      throw new ConflictException(
        subjectClassArchivedMessage(record.displayName)
      );
    }
    const teacher = await this.classes.checkTeacher(
      ctx,
      record.campusId,
      pick.userId
    );
    if (teacher === undefined) {
      throw new NotFoundException(CLASS_MEMBER_NOT_FOUND_MESSAGE);
    }
    if (subject.retiredAt !== null) {
      throw new BadRequestException(subjectRetiredMessage(subject.name));
    }
    const onLevel = await this.subjects.listLevelSubjects(
      ctx.organizationId,
      record.levelId
    );
    if (!onLevel.some((entry) => entry.subjectId === pick.subjectId)) {
      throw new BadRequestException(SUBJECT_NOT_ON_LEVEL_MESSAGE);
    }
    if (!teacher.candidate) {
      throw new BadRequestException(
        subjectTeacherNotCandidateMessage(record.campusName)
      );
    }
    return teacher;
  }

  remove(
    ctx: OrgContext,
    classId: string,
    subjectId: string
  ): Promise<SubjectTeacherRemoved> {
    const organizationId = ctx.organizationId;
    return this.lock.run(organizationId, async () => {
      await this.classes.requireVisible(ctx, classId);
      const term = await this.subjects.currentTerm(organizationId);
      const removed =
        term !== undefined &&
        (await this.subjects.deleteSubjectTeacher(organizationId, {
          classId,
          subjectId,
          termId: term.id,
        }));
      if (!removed) {
        throw new NotFoundException(SUBJECT_TEACHER_NOT_FOUND_MESSAGE);
      }
      return { classId, subjectId };
    });
  }

  copyFromPreviousTerm(ctx: OrgContext): Promise<SubjectTeachersCopied> {
    const organizationId = ctx.organizationId;
    return this.lock.run(organizationId, async () => {
      const term = await this.requireCurrentTerm(ctx);
      const previous = await this.subjects.previousTerm(organizationId);
      if (previous === undefined) {
        throw new ConflictException(SUBJECT_NO_PREVIOUS_TERM_MESSAGE);
      }
      const classes = await this.visibleClasses(ctx);
      const ids = classes.map((record) => record.id);
      const [before, now, levelSubjects] = await Promise.all([
        this.subjects.listAssignments(organizationId, ids, previous.id),
        this.subjects.listAssignments(organizationId, ids, term.id),
        this.subjects.listLevelSubjects(organizationId),
      ]);
      const plan = planCopy(before, {
        classes,
        levelSubjects,
        filled: new Set(now.map((row) => assignmentKey(row))),
        candidates: await this.candidatesByCampus(ctx, before, classes),
      });
      const copied = await this.insertAll(
        ctx,
        term.id,
        plan.filter((decision) => decision.reason === null)
      );
      return {
        copied,
        skipped: plan.flatMap(({ row, reason }) =>
          reason === null
            ? []
            : [{ classId: row.classId, subjectId: row.subjectId, reason }]
        ),
        from: previous,
      };
    });
  }

  private async candidatesByCampus(
    ctx: OrgContext,
    rows: readonly TermAssignment[],
    classes: readonly ClassRef[]
  ): Promise<Map<string, Set<string>>> {
    const used = new Set(rows.map((row) => row.classId));
    const campusIds = new Set(
      classes
        .filter((record) => used.has(record.id))
        .map((record) => record.campusId)
    );
    const entries = await Promise.all(
      [...campusIds].map(
        async (campusId) =>
          [campusId, await this.classes.candidateIds(ctx, campusId)] as const
      )
    );
    return new Map(entries);
  }

  private async insertAll(
    ctx: OrgContext,
    termId: string,
    decisions: readonly { row: TermAssignment }[]
  ): Promise<number> {
    let copied = 0;
    for (const { row } of decisions) {
      const inserted = await this.subjects.insertSubjectTeacherIfEmpty(
        ctx.organizationId,
        { ...row, termId, assignedBy: ctx.user.id }
      );
      copied += inserted ? 1 : 0;
    }
    return copied;
  }
}
