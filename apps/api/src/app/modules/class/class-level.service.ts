import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CLASS_LEVEL_NOT_FOUND_MESSAGE,
  CLASS_LEVEL_SELF_NEXT_MESSAGE,
  classLevelExistsMessage,
  type ClassLevel,
  type CreateClassLevelInput,
  type UpdateClassLevelInput,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { SchoolLock } from '../../common/db/school-lock';
import { reorderLevelIds, toClassLevel } from './class-view';
import { ClassRepository } from './class.repository';

const levelNotFound = () =>
  new NotFoundException(CLASS_LEVEL_NOT_FOUND_MESSAGE);

@Injectable()
export class ClassLevelService {
  constructor(
    private readonly classes: ClassRepository,
    private readonly lock: SchoolLock
  ) {}

  async list(ctx: OrgContext): Promise<ClassLevel[]> {
    const levels = await this.classes.listLevels(ctx.organizationId);
    return levels.map((level) => toClassLevel(level));
  }

  create(ctx: OrgContext, input: CreateClassLevelInput): Promise<ClassLevel> {
    const organizationId = ctx.organizationId;
    return this.lock.run(organizationId, async () => {
      if (await this.classes.findLevelByCode(organizationId, input.code)) {
        throw new ConflictException(classLevelExistsMessage(input.code));
      }
      const nextLevelId = input.nextLevelId ?? null;
      await this.assertNextLevel(organizationId, nextLevelId);
      const level = await this.classes.insertLevel(organizationId, {
        code: input.code,
        name: input.name.trim(),
        nextLevelId,
      });
      return toClassLevel(level);
    });
  }

  update(
    ctx: OrgContext,
    id: string,
    input: UpdateClassLevelInput
  ): Promise<ClassLevel> {
    if (input.nextLevelId === id) {
      throw new BadRequestException(CLASS_LEVEL_SELF_NEXT_MESSAGE);
    }
    const organizationId = ctx.organizationId;
    return this.lock.run(organizationId, async () => {
      if ((await this.classes.findLevel(organizationId, id)) === undefined) {
        throw levelNotFound();
      }
      await this.assertNextLevel(organizationId, input.nextLevelId ?? null);
      if (input.name !== undefined || input.nextLevelId !== undefined) {
        await this.classes.updateLevel(organizationId, id, {
          name: input.name?.trim(),
          nextLevelId: input.nextLevelId,
        });
      }
      if (input.sequence !== undefined) {
        await this.move(organizationId, id, input.sequence);
      }
      const level = await this.classes.findLevel(organizationId, id);
      if (level === undefined) {
        throw levelNotFound();
      }
      return toClassLevel(level);
    });
  }

  private async assertNextLevel(
    organizationId: string,
    nextLevelId: string | null
  ): Promise<void> {
    if (
      nextLevelId !== null &&
      (await this.classes.findLevel(organizationId, nextLevelId)) === undefined
    ) {
      throw levelNotFound();
    }
  }

  private async move(
    organizationId: string,
    id: string,
    position: number
  ): Promise<void> {
    const levels = await this.classes.listLevels(organizationId);
    const ids = levels.map((level) => level.id);
    const reordered = reorderLevelIds(ids, id, position);
    if (reordered.some((candidate, index) => candidate !== ids[index])) {
      await this.classes.applyLevelOrder(organizationId, reordered);
    }
  }
}
