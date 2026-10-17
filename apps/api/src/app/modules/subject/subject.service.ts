import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LEVEL_SUBJECT_LEVEL_NOT_FOUND_MESSAGE,
  SUBJECT_NOT_FOUND_MESSAGE,
  contract,
  subjectCodeTakenMessage,
  subjectOnLevelMessage,
  subjectRetiredMessage,
  type LevelSubject,
  type RouteBody,
  type RouteQuery,
  type Subject,
  type SubjectList,
  type UpdateSubjectInput,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { SchoolLock } from '../../common/db/school-lock';
import { SubjectRepository, type SubjectRecord } from './subject.repository';

type ListQuery = RouteQuery<typeof contract.subjects.list>;
type LevelQuery = RouteQuery<typeof contract.levelSubjects.list>;
type NewSubjectBody = RouteBody<typeof contract.subjects.create>;
type ReplaceBody = RouteBody<typeof contract.levelSubjects.replace>;

const notFound = () => new NotFoundException(SUBJECT_NOT_FOUND_MESSAGE);

@Injectable()
export class SubjectService {
  constructor(
    private readonly subjects: SubjectRepository,
    private readonly lock: SchoolLock
  ) {}

  private async require(ctx: OrgContext, id: string): Promise<SubjectRecord> {
    const record = await this.subjects.findSubject(ctx.organizationId, id);
    if (record === undefined) {
      throw notFound();
    }
    return record;
  }

  list(ctx: OrgContext, query: ListQuery): Promise<SubjectList> {
    return this.subjects.listSubjects(ctx.organizationId, {
      includeRetired: query.includeRetired,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    });
  }

  create(ctx: OrgContext, input: NewSubjectBody): Promise<Subject> {
    const organizationId = ctx.organizationId;
    return this.lock.run(organizationId, async () => {
      const { code } = input;
      if (
        (await this.subjects.findSubjectByCode(organizationId, code)) !==
        undefined
      ) {
        throw new ConflictException(subjectCodeTakenMessage(code));
      }
      const id = await this.subjects.insertSubject(organizationId, {
        code,
        name: input.name,
      });
      return this.require(ctx, id);
    });
  }

  update(
    ctx: OrgContext,
    id: string,
    input: UpdateSubjectInput
  ): Promise<Subject> {
    const organizationId = ctx.organizationId;
    return this.lock.run(organizationId, async () => {
      const record = await this.require(ctx, id);
      const { name } = input;
      const retiring = input.retired === true && record.retiredAt === null;
      if (retiring && (await this.subjects.isOnAnyLevel(organizationId, id))) {
        throw new ConflictException(subjectOnLevelMessage(record.name));
      }
      if (name !== undefined && name !== record.name) {
        await this.subjects.renameSubject(organizationId, id, name);
      }
      if (retiring) {
        await this.subjects.setSubjectRetired(organizationId, id, ctx.user.id);
      }
      if (input.retired === false && record.retiredAt !== null) {
        await this.subjects.setSubjectRetired(organizationId, id, null);
      }
      return this.require(ctx, id);
    });
  }

  async levelSubjects(
    ctx: OrgContext,
    query: LevelQuery
  ): Promise<LevelSubject[]> {
    if (
      query.classLevelId !== undefined &&
      !(await this.subjects.levelExists(ctx.organizationId, query.classLevelId))
    ) {
      throw new NotFoundException(LEVEL_SUBJECT_LEVEL_NOT_FOUND_MESSAGE);
    }
    const rows = await this.subjects.listLevelSubjects(
      ctx.organizationId,
      query.classLevelId
    );
    return rows.map(
      ({
        classLevelId,
        subjectId,
        subjectCode,
        subjectName,
        kind,
        sequence,
        takerCount,
      }) => ({
        classLevelId,
        subjectId,
        subjectCode,
        subjectName,
        kind,
        sequence,
        takerCount,
      })
    );
  }

  replaceLevelSubjects(
    ctx: OrgContext,
    levelId: string,
    body: ReplaceBody
  ): Promise<LevelSubject[]> {
    const organizationId = ctx.organizationId;
    return this.lock.run(organizationId, async () => {
      if (!(await this.subjects.levelExists(organizationId, levelId))) {
        throw new NotFoundException(LEVEL_SUBJECT_LEVEL_NOT_FOUND_MESSAGE);
      }
      const found = await this.subjects.subjectsByIds(
        organizationId,
        body.subjects.map((row) => row.subjectId)
      );
      const byId = new Map(found.map((record) => [record.id, record]));
      for (const row of body.subjects) {
        if (!byId.has(row.subjectId)) {
          throw notFound();
        }
      }
      for (const record of byId.values()) {
        if (record.retiredAt !== null) {
          throw new BadRequestException(subjectRetiredMessage(record.name));
        }
      }
      await this.subjects.replaceLevelList(
        organizationId,
        levelId,
        body.subjects
      );
      return this.levelSubjects(ctx, { classLevelId: levelId });
    });
  }
}
