import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CLASS_LEVEL_NOT_FOUND_MESSAGE,
  CLASS_MEMBER_NOT_FOUND_MESSAGE,
  CLASS_NAME_TAKEN_MESSAGE,
  CLASS_NOT_FOUND_MESSAGE,
  CLASS_NO_CURRENT_TERM_MESSAGE,
  CLASS_TEACHER_NOT_FOUND_MESSAGE,
  classArchivedExistsMessage,
  classArchivedTeachersMessage,
  classExistsMessage,
  classHasLeadMessage,
  classHasPlacementsMessage,
  classTeacherNotCandidateMessage,
  classTeacherRepeatMessage,
  type AssignClassTeacherInput,
  type ClassDetail,
  type ClassListQuery,
  type ClassSummary,
  type ClassTeacher,
  type ClassTeacherRemoved,
  type CreateClassInput,
  type TeacherCandidate,
  type TeacherCandidatesQuery,
  type UpdateClassInput,
} from '@eduvault/api-contract';
import { can } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import { SchoolLock } from '../../common/db/school-lock';
import { CampusService } from '../campus/campus.service';
import {
  classDisplayName,
  teacherCandidates,
  toClassDetail,
  toClassSummary,
} from './class-view';
import {
  ClassRepository,
  type ClassRecord,
  type ClassTeacherRecord,
  type Visibility,
} from './class.repository';

const classNotFound = () => new NotFoundException(CLASS_NOT_FOUND_MESSAGE);

const everything: Visibility = { campusScope: 'all', classScope: 'all' };

const displayOf = (record: ClassRecord): string =>
  classDisplayName(record.levelName, record.name);

export interface ClassRef {
  id: string;
  displayName: string;
  levelId: string;
  campusId: string;
  campusName: string;
  retiredAt: string | null;
}

const toRef = (record: ClassRecord): ClassRef => ({
  id: record.id,
  displayName: displayOf(record),
  levelId: record.levelId,
  campusId: record.campusId,
  campusName: record.campusName,
  retiredAt: record.retiredAt,
});

@Injectable()
export class ClassService {
  constructor(
    private readonly classes: ClassRepository,
    private readonly campuses: CampusService,
    private readonly lock: SchoolLock
  ) {}

  private visibility(ctx: OrgContext): Visibility {
    return { campusScope: ctx.campusScope, classScope: ctx.classScope };
  }

  private async requireClass(
    ctx: OrgContext,
    id: string,
    visibility: Visibility = this.visibility(ctx)
  ): Promise<ClassRecord> {
    const record = await this.classes.findClass(
      ctx.organizationId,
      id,
      visibility
    );
    if (record === undefined) {
      throw classNotFound();
    }
    return record;
  }

  private async teachersOf(
    ctx: OrgContext,
    ids: readonly string[]
  ): Promise<ClassTeacherRecord[]> {
    const sessionId = await this.classes.currentSessionId(ctx.organizationId);
    return sessionId === null
      ? []
      : this.classes.teachersOf(ctx.organizationId, ids, sessionId);
  }

  private async summarise(
    ctx: OrgContext,
    records: readonly ClassRecord[]
  ): Promise<ClassSummary[]> {
    const ids = records.map((record) => record.id);
    const [teachers, counts] = await Promise.all([
      this.teachersOf(ctx, ids),
      this.classes.studentCounts(ctx.organizationId, ids),
    ]);
    return records.map((record) =>
      toClassSummary(
        record,
        teachers.filter((teacher) => teacher.classId === record.id),
        counts[record.id] ?? 0
      )
    );
  }

  private async summaryOf(ctx: OrgContext, id: string): Promise<ClassSummary> {
    const record = await this.requireClass(ctx, id, everything);
    const [teachers, counts] = await Promise.all([
      this.teachersOf(ctx, [id]),
      this.classes.studentCounts(ctx.organizationId, [id]),
    ]);
    return toClassSummary(record, teachers, counts[id] ?? 0);
  }

  async list(ctx: OrgContext, query: ClassListQuery): Promise<ClassSummary[]> {
    if (query.campusId !== undefined) {
      await this.campuses.assertInScope(ctx, query.campusId);
    }
    const records = await this.classes.listClasses(ctx.organizationId, {
      ...this.visibility(ctx),
      campusId: query.campusId,
      levelId: query.levelId,
      status: ctx.classScope === 'all' ? (query.status ?? 'active') : 'active',
    });
    return this.summarise(ctx, records);
  }

  async get(ctx: OrgContext, id: string): Promise<ClassDetail> {
    const record = await this.requireClass(ctx, id);
    const roster = can(ctx.permissions, 'student', 'read')
      ? await this.classes.roster(ctx.organizationId, id)
      : null;
    const counts = await this.classes.studentCounts(ctx.organizationId, [id]);
    const count = roster?.length ?? counts[id] ?? 0;
    return {
      ...toClassDetail(
        record,
        toClassSummary(record, await this.teachersOf(ctx, [id])).classTeachers,
        roster
      ),
      studentCount: count,
    };
  }

  async create(
    ctx: OrgContext,
    input: CreateClassInput
  ): Promise<ClassSummary> {
    const organizationId = ctx.organizationId;
    if (
      (await this.classes.findLevel(organizationId, input.levelId)) ===
      undefined
    ) {
      throw new NotFoundException(CLASS_LEVEL_NOT_FOUND_MESSAGE);
    }
    await this.campuses.assertInScope(ctx, input.campusId);
    const name = input.name.trim();
    return this.lock.run(organizationId, async () => {
      await this.assertNameFree(ctx, {
        levelId: input.levelId,
        campusId: input.campusId,
        name,
      });
      const id = await this.classes.insertClass(organizationId, {
        levelId: input.levelId,
        campusId: input.campusId,
        name,
      });
      return this.summaryOf(ctx, id);
    });
  }

  update(
    ctx: OrgContext,
    id: string,
    input: UpdateClassInput
  ): Promise<ClassSummary> {
    const organizationId = ctx.organizationId;
    return this.lock.run(organizationId, async () => {
      const record = await this.requireClass(ctx, id);
      const name = input.name?.trim();
      const archiving = input.archived === true && record.retiredAt === null;
      if (
        archiving &&
        (await this.classes.hasPlacementsFromCurrentTerm(organizationId, id))
      ) {
        throw new ConflictException(
          classHasPlacementsMessage(displayOf(record))
        );
      }
      if (name !== undefined && name !== record.name) {
        await this.assertNameFree(
          ctx,
          { levelId: record.levelId, campusId: record.campusId, name },
          record.id
        );
        await this.classes.renameClass(organizationId, id, name);
      }
      if (archiving) {
        await this.classes.setRetired(organizationId, id, ctx.user.id);
      }
      if (input.archived === false && record.retiredAt !== null) {
        await this.classes.setRetired(organizationId, id, null);
      }
      return this.summaryOf(ctx, id);
    });
  }

  async teacherCandidates(
    ctx: OrgContext,
    id: string,
    query: TeacherCandidatesQuery = {}
  ): Promise<TeacherCandidate[]> {
    const record = await this.requireClass(ctx, id);
    const current =
      query.for === 'subject' ? [] : await this.teachersOf(ctx, [id]);
    const { members, custom } = await this.membersAndRoles(
      ctx,
      record.campusId
    );
    return teacherCandidates(
      members,
      custom,
      new Set(current.map((teacher) => teacher.userId))
    ).map(({ userId, name }) => ({ userId, name }));
  }

  async requireVisible(ctx: OrgContext, id: string): Promise<ClassRef> {
    return toRef(await this.requireClass(ctx, id));
  }

  async listVisible(ctx: OrgContext): Promise<ClassRef[]> {
    const records = await this.classes.listClasses(ctx.organizationId, {
      ...this.visibility(ctx),
      status: 'active',
    });
    return records.map((record) => toRef(record));
  }

  async checkTeacher(
    ctx: OrgContext,
    campusId: string,
    userId: string
  ): Promise<{ name: string; candidate: boolean } | undefined> {
    const { members, custom } = await this.membersAndRoles(ctx, campusId);
    const member = members.find((candidate) => candidate.userId === userId);
    if (member === undefined) {
      return undefined;
    }
    return {
      name: member.name,
      candidate: teacherCandidates([member], custom, new Set()).length > 0,
    };
  }

  async candidateIds(ctx: OrgContext, campusId: string): Promise<Set<string>> {
    const { members, custom } = await this.membersAndRoles(ctx, campusId);
    return new Set(
      teacherCandidates(members, custom, new Set()).map(
        (candidate) => candidate.userId
      )
    );
  }

  private async membersAndRoles(ctx: OrgContext, campusId: string) {
    const [members, custom] = await Promise.all([
      this.classes.listMembers(ctx.organizationId, campusId),
      this.classes.rolePermissions(ctx.organizationId),
    ]);
    return { members, custom };
  }

  assignTeacher(
    ctx: OrgContext,
    id: string,
    input: AssignClassTeacherInput
  ): Promise<ClassTeacher> {
    const organizationId = ctx.organizationId;
    return this.lock.run(organizationId, async () => {
      const record = await this.requireClass(ctx, id);
      const members = await this.classes.listMembers(
        organizationId,
        record.campusId
      );
      const member = members.find(
        (candidate) => candidate.userId === input.userId
      );
      if (member === undefined) {
        throw new NotFoundException(CLASS_MEMBER_NOT_FOUND_MESSAGE);
      }
      const sessionId = await this.classes.currentSessionId(organizationId);
      if (sessionId === null) {
        throw new ConflictException(CLASS_NO_CURRENT_TERM_MESSAGE);
      }
      const display = displayOf(record);
      if (record.retiredAt !== null) {
        throw new ConflictException(classArchivedTeachersMessage(display));
      }
      const custom = await this.classes.rolePermissions(organizationId);
      if (teacherCandidates([member], custom, new Set()).length === 0) {
        throw new BadRequestException(
          classTeacherNotCandidateMessage(record.campusName)
        );
      }
      const teachers = await this.classes.teachersOf(
        organizationId,
        [id],
        sessionId
      );
      if (teachers.some((teacher) => teacher.userId === member.userId)) {
        throw new ConflictException(
          classTeacherRepeatMessage(member.name, display)
        );
      }
      const lead = teachers.find((teacher) => teacher.role === 'lead');
      if (input.role === 'lead' && lead !== undefined) {
        throw new ConflictException(classHasLeadMessage(display, lead.name));
      }
      await this.classes.insertTeacher(organizationId, {
        classId: id,
        sessionId,
        userId: member.userId,
        role: input.role,
        createdBy: ctx.user.id,
      });
      return { userId: member.userId, name: member.name, role: input.role };
    });
  }

  removeTeacher(
    ctx: OrgContext,
    id: string,
    userId: string
  ): Promise<ClassTeacherRemoved> {
    const organizationId = ctx.organizationId;
    return this.lock.run(organizationId, async () => {
      await this.requireClass(ctx, id);
      const sessionId = await this.classes.currentSessionId(organizationId);
      const removed =
        sessionId !== null &&
        (await this.classes.deleteTeacher(organizationId, {
          classId: id,
          sessionId,
          userId,
        }));
      if (!removed) {
        throw new NotFoundException(CLASS_TEACHER_NOT_FOUND_MESSAGE);
      }
      return { classId: id, userId };
    });
  }

  private async assertNameFree(
    ctx: OrgContext,
    key: { levelId: string; campusId: string; name: string },
    exceptId?: string
  ): Promise<void> {
    const clash = await this.classes.findClassByName(ctx.organizationId, key);
    if (clash === undefined || clash.id === exceptId) {
      return;
    }
    if (ctx.classScope !== 'all' && !ctx.classScope.includes(clash.id)) {
      throw new ConflictException(CLASS_NAME_TAKEN_MESSAGE);
    }
    const display = displayOf(clash);
    throw new ConflictException(
      clash.retiredAt === null
        ? classExistsMessage(display, clash.campusName)
        : classArchivedExistsMessage(display, clash.campusName)
    );
  }
}
