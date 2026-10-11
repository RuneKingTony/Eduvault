import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  GRADUATE_NOT_ON_ROSTER_MESSAGE,
  GRADUATE_NO_CURRENT_TERM_MESSAGE,
  graduateNotFinalYearMessage,
  type ClassGraduated,
  type GraduateClassInput,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { SchoolLock } from '../../common/db/school-lock';
import { ClassService } from '../class/class.service';
import { LifecycleRepository } from './lifecycle.repository';

@Injectable()
export class GraduationService {
  constructor(
    private readonly classes: ClassService,
    private readonly lifecycle: LifecycleRepository,
    private readonly lock: SchoolLock
  ) {}

  async graduate(
    ctx: OrgContext,
    classId: string,
    input: GraduateClassInput
  ): Promise<ClassGraduated> {
    const klass = await this.classes.get(ctx, classId);
    if (!klass.isFinalYear) {
      throw new BadRequestException(
        graduateNotFinalYearMessage(klass.displayName)
      );
    }
    const ids = [...new Set(input.studentIds)];
    return this.lock.run(ctx.organizationId, () =>
      this.lifecycle.transaction(async (tx) => {
        const term = await tx.currentTerm(ctx.organizationId);
        if (term === undefined) {
          throw new ConflictException(GRADUATE_NO_CURRENT_TERM_MESSAGE);
        }
        const roster = await tx.lockRoster(ctx.organizationId, {
          armId: classId,
          ids,
        });
        if (roster.length !== ids.length) {
          throw new BadRequestException(GRADUATE_NOT_ON_ROSTER_MESSAGE);
        }
        const graduated = await tx.graduate({
          organizationId: ctx.organizationId,
          actorUserId: ctx.user.id,
          termId: term.termId,
          sessionId: term.sessionId,
          students: roster,
        });
        return { graduated };
      })
    );
  }
}
